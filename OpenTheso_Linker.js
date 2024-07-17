const url = require('url');
const fs = require('fs');
const arangojs = require('arangojs');
const aql = require('arangojs').aql;
const config = require('./config.js');
const dbaccess = require('./dbaccess.js');
const natural = require('natural');
const stopwords = require('natural/lib/natural/util/stopwords_fr');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage')

// 1. Connect to the database and get the thesauri collection
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});
db.useBasicAuth(dbaccess.login, dbaccess.pwd);

// 2. we use command line args to allow user to specify wich test(s) he wants to perform (default : none)
// To do : add an argument to specify the list of thesauri to be tested (for now: all of them are tested)
const optionDefinitions = [
  {
    name: "help",
    alias: "h",
    type: Boolean,
    description: "Display this usage guide."
  },
  {
    name: 'inclusions',
    type: Boolean,
    description: 'Whether or not we have to perform the inclusion test (try to find relation like "A included in B", e.g. "chapelle" included in "chapelles de la nef"). Default: false'
  },
  {
    name: 'homonyms',
    type: Boolean,
    description: 'Whether or not we have to perform the homonymy test. Defaut: false'
  },
  {
    name: 'aioli',
    type: Boolean,
    description: 'Whether or not we have to perform the inclusion test with aioli annotations(try to find thesaurus terms inside aioli annotations descriptions. Performed with NLP, can be subject to lexical ambiguities. Default: false'
  },
  {
    name: 'thesauri',
    multiple: true,
    description: 'Provide a list of thesauri to be tested (default: all). NOTE: Not yet operational !'
  }
]
const options = commandLineArgs(optionDefinitions);
const usage = commandLineUsage([
  {
    header: 'An app to build semantic relations between concepts and/or annotations and save them in a graph with ArangoDB.',
    content: 'This app aims to look for semantic relations between concepts from thesauri, and/or semantic annotations from Aioli. Pre-requisite : the database must have be filled before using {italic OpenTheso_Synchronizer.js} and {italic Aioli_Synchronizer.js}. For now, all the concepts from all thesauri are tested. We will later add an option to specify which specific thesauri need to be tested.'
  },
  {
    header: 'Options',
    optionList: optionDefinitions
  },
  {
    content: 'Project home: {underline https://github.com/VCityTeam/TT-ArangoFeeder}'
  }
]);

// if no arg, display usage guide (by default, are test (multithesaurus inclusion, homonymy, thesauri/aioli inclusion) are set on false)
if(options.help || (!options.inclusions && !options.homonyms && !options.aioli)){
  console.log(usage);
}
else{
  let toTest = {
    inclusions: options.inclusions ? true : false,
    homonyms: options.homonyms ? true : false,
    aioli: options.aioli ? true : false
  }
  console.log(toTest);

  var thesauri = db.collection("Thesauri");

  // dans tous les cas on doit recuperer la liste des thesauri disponibles
  let listThesauri = thesauri.all().then(
    cursor => cursor.all()
  ).then(
    res => {
      if(!options.thesauri || options.thesauri.length == 0){
        // array with all the names of available thesauri in the database
        let thNames = res.map(t => t._key);
        loadAllThesauri(thNames, toTest.inclusions, toTest.homonyms, toTest.aioli);
      }
      else {
        // An array of candidates thesauri is given, we keep valid ones (those which are also available in the DB)
        let thNames = res.map(t => t._key).filter(t => options.thesauri.indexOf(t) > -1);
        loadAllThesauri(thNames, toTest.inclusions, toTest.homonyms, toTest.aioli);
      }
    }
  )

}


// List all possible pairs from an array
let getPairs = (arr) => arr.map( (v, i) => arr.slice(i + 1).map(w => [v, w]) ).flat();


/**
 * This function load thesaurus concept (from a list of candidates thesauri) and execute semantic test functions.
 * @param {Array} thNames an array of candidates thesaurus names (e.g ["th13", "th18"])
 * @param {Boolean} [inclusions=false] whether or not look for semantic inclusions.
 * @param {Boolean} [homonyms=false] whether or not look for homonyms.
 * @param {Boolean} [aioli=false] whether or not look for thesaurus terms inside aioli annotations.
 */
async function loadAllThesauri(thNames, inclusions=false, homonyms=false, aioli=false){

  let thCollecs = [];
  for (let k=0; k<thNames.length; k++){
    let cursor = await db.collection(thNames[k]).all();
    let theso = await cursor.all();
    thCollecs.push(theso);

    // if k is the last one
    if(k == thNames.length - 1){

      if(inclusions){
        await testInclusions(thCollecs);
      }
      if(homonyms){
        await testHomonymes(thCollecs);
      }
      if(aioli){
        await testAiolidescriptions(thCollecs);
      }

    }
  }

}

/**
 * This function test each concept of the input array to check if it is included in any of the other concepts label. Save all inclusions as relations in ArangoDB.
 * @param {Array} thCollecs an array of concepts from one or more thesauri
 */
async function testInclusions(thCollecs){
  let flatten = thCollecs.flat();
  let totallength = flatten.length;
  console.log(totallength); // nombre de concepts à tester

  // INCLUSION
  let conceptNames = flatten.map(c => c.name);
  let inclusions = flatten.map((item, i) => {
    let includedIn = flatten.map((c, index) => {

      let nameA = item.name.replace(/[&\/\\#,+()$~%.:*?<>{}\[\]]/g, '');
      let nameB = c.name.replace(/[&\/\\#,+()$~%.:*?<>{}\[\]]/g, '');

      let regA = new RegExp('\\b' + nameA + '\\b');
      let regB = new RegExp('\\b' + nameB + '\\b');

      let found_AinB = regA.test(nameB);

      if(found_AinB == true && conceptNames.indexOf(c.name) !== i && nameA.length > 3 && nameB.length > 3){
        return c._id
      }
      else {
        return null
      }

    });
    return [item._id, includedIn];
  });

  let notnull = inclusions.map(z => ([z[0],z[1].filter(n => n !== null)]));
  let relations = notnull.map(d => d[1].map(correspondances => ({_from: d[0], _to: correspondances, type: 'related to', provenance: 'internal calculation'}))).flat();
  console.log(relations);

  var intraThesoRelations = db.collection(config.collections.intraThesoRelations.name);
  const result = db.query({
    query: `
    FOR entry IN @toInsert INSERT entry INTO @@relationsColl RETURN true
    `,
    bindVars: {
      toInsert: relations,
      relationsColl: intraThesoRelations
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));
  // const result = db.query({
  //   query: `
  //   FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
  //   `,
  //   bindVars: {
  //     toInsert: relations,
  //   }
  // }).then(
  //   cursor => cursor.all()
  // ).then(
  //   res => console.log(res));

}

/**
 * This function test each concept of the input array to check if it matches with any of the other concepts label. Save all homonyms as relations in ArangoDB.
 * @param {Array} thCollecs an array of concepts from one or more thesauri
 */
async function testHomonymes(thCollecs){
  let allConcepts = thCollecs.flat();
  let totallength = allConcepts.length;
  console.log(totallength); // nombre de concepts à tester

  // HOMONYMIE SUR LE MAIN LABEL
  let conceptNames = allConcepts.map(c => c.name);
  let duplicates = conceptNames.filter((item, index) => conceptNames.indexOf(item) !== index);
  let indexOfAll = (arr, val) => arr.reduce((acc, el, i) => (el === val ? [...acc, i] : acc), []);
  let duplicatesIndexes = duplicates.map(item => getPairs(indexOfAll(conceptNames, item).map(h => allConcepts[h]._id)).map(pair => ({_from: pair[0], _to: pair[1], type: "homonym", provenance: "internal calculation"})));
  let relations = duplicatesIndexes.flat();

  var intraThesoRelations = db.collection(config.collections.intraThesoRelations.name);
  const result = db.query({
    query: `
    FOR entry IN @toInsert INSERT entry INTO @@relationsColl RETURN 1
    `,
    bindVars: {
      toInsert: relations,
      relationsColl: intraThesoRelations
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));
  // const result = db.query({
  //   query: `
  //   FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
  //   `,
  //   bindVars: {
  //     toInsert: relations,
  //   }
  // }).then(
  //   cursor => cursor.all()
  // ).then(
  //   res => console.log(res));

}

/**
 * This function test each concept of the input array to check if it is included in any of the description of public aioli annotations. Save all matches as relations in ArangoDB.
 * @param {Array} thCollecs an array of concepts from one or more thesauri
 */
async function testAiolidescriptions(thCollecs){
  let allConcepts = thCollecs.flat();
  let conceptNames = allConcepts.map(c => c.name);

  var nounInflector = new natural.NounInflector();
  var tokenizer = new natural.AggressiveTokenizerFr();

  // tokenize each concept, remove stopwords (de, et, la, ...), singularize and then reconstruct the string
  // we'll do the same to the aioli descriptions and then we can compare them
  let stemmedConceptNames = conceptNames.map(c => {
    let tokenized = tokenizer.tokenize(c);
    let result = tokenized.filter(token =>
      stopwords.words.indexOf(token) === -1
    );
    let sing = result.map(token => nounInflector.singularize(token));
    let finalString = sing.join(" ");
    return finalString;
  });
  console.log(stemmedConceptNames);

  var aioliObjects = db.collection(config.collections.aioliObjects.name); // db.collection("aioli_objects");
  let listAioliObjects = aioliObjects.all().then(
    cursor => cursor.all()
  ).then(
    res => {
      let regions = res.filter(doc => doc.type == "Region" && Object.keys(doc.description).length > 0)
      let descriptions = regions.map(reg => ({[reg._id]: reg.description}));
      let descriptionStrings = descriptions.map(d => ({[Object.keys(d)[0]]: JSON.stringify(Object.values(d))}) );

      let cleanedDescriptions = descriptionStrings.map(item => {

        for (const [key, value] of Object.entries(item)) {
          let tokenized = tokenizer.tokenize(value);
          let result = tokenized.filter(token =>
            stopwords.words.indexOf(token) === -1
          );
          let sing = result.map(token => nounInflector.singularize(token));
          let finalString = sing.join(" ");
          return ({[key]: finalString})
        }
      })

      let matches = stemmedConceptNames.map((concept, i) => {
        let tmp = cleanedDescriptions.filter(d => Object.values(d)[0].indexOf(" " + concept + " ") > -1 && isNaN(concept) == true && concept.length > 2).map(match => {
          console.log(conceptNames[i] + " FOUND IN " + Object.values(match)[0] + "\n");

          let ambiguities = ["cours", "cadre", "niveau", "place"]; // to be improved: define a list of lexical ambiguities to assign a confidence score to the match?
          let ambiguity = false;
          if(ambiguities.indexOf(allConcepts[i].name) > -1){
            ambiguity = true; // undefined, weak, medium, strong ? Quantify ambiguities ?
          }
          let relation = {_from: allConcepts[i]._id, _to: Object.keys(match)[0], type: "vocabulary", provenance: {method: "internal calculation", timestamp: Date.now(), script: "SemanticLinker", function: "testAiolidescriptions", ambiguity: true}};
          return relation;
        })
        return tmp;
      });

      let relations = matches.filter(entry => entry.length > 0).flat();
      console.log(relations);

      var semanticLinks = db.collection(config.collections.semanticLinks.name);
      const result = db.query({
        query: `
        FOR entry IN @toInsert INSERT entry INTO @@semanticLinksColl RETURN 1
        `,
        bindVars: {
          toInsert: relations,
          semanticLinksColl: semanticLinks,
        }
      }).then(
        cursor => cursor.all()
      ).then(
        res => console.log(res));

      // const result = db.query({
      //   query: `
      //   FOR entry IN @toInsert INSERT entry INTO SemanticLinks RETURN 1
      //   `,
      //   bindVars: {
      //     toInsert: relations,
      //   }
      // }).then(
      //   cursor => cursor.all()
      // ).then(
      //   res => console.log(res));

    }
  )
}
