var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
//var aql = require('arangojs/aql');
var aql = require('arangojs').aql;
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');
var natural = require('natural');
const stopwords = require('natural/lib/natural/util/stopwords_fr');


// 1. Connect to the database and get the thesauri collection
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

db._connection._agentOptions.maxSockets = 8;

var thesauri = db.collection("Thesauri");
var intraThesoRelations = db.collection(config.collections.intraThesoRelations.name);


let listThesauri = thesauri.all().then(
  cursor => cursor.all()
).then(
  res => {
    loadAllThesauri(res);
  }
)

// Liste les paires possibles à partir d'un array
let getPairs = (arr) => arr.map( (v, i) => arr.slice(i + 1).map(w => [v, w]) ).flat();

async function loadAllThesauri(thesauri){
  // array avec le nom des thesauri disponible dans ma BDD
  let thNames = thesauri.map(t => t._key);

  let thCollecs = [];
  for (let k=0; k<thNames.length; k++){
    let cursor = await db.collection(thNames[k]).all();
    let theso = await cursor.all();
    thCollecs.push(theso);
    if(k == thNames.length - 1){
     //testInclusions(thCollecs);
     //testHomonymes(thCollecs);
     testAiolidescriptions(thCollecs);
    }
    // if(k == 2){ // pour des tests rapides
    //   testAiolidescriptions(thCollecs);
    // }
  }

}

async function testInclusions(thCollecs){
  let flatten = thCollecs.flat();
  let totallength = flatten.length;
  console.log(totallength);

  /*
  // FONCTIONNE (A ETENDRE AUX LABELS SECONDAIRES)
  // HOMONYMIE SUR LE MAIN LABEL
  let conceptNames = flatten.map(c => c.name);
  const duplicates = conceptNames.filter((item, index) => conceptNames.indexOf(item) !== index);
  const indexOfAll = (arr, val) => arr.reduce((acc, el, i) => (el === val ? [...acc, i] : acc), []);
  duplicates.forEach(item => {
    const duplicatesIndexes = indexOfAll(conceptNames, item);
    console.log(item, duplicatesIndexes);
  });
  */


  // INCLUSION
  // FONCTIONNE !!
  let conceptNames = flatten.map(c => c.name);
  const inclusions = flatten.map((item, i) => {
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

  const notnull = inclusions.map(z => ([z[0],z[1].filter(n => n !== null)]));
  const relations = notnull.map(d => d[1].map(correspondances => ({_from: d[0], _to: correspondances, type: 'related to', provenance: 'internal calculation'}))).flat();
  console.log(relations);

  const result = db.query({
    query: `
    FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
    `,
    bindVars: {
      toInsert: relations,
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));

}

async function testHomonymes(thCollecs){
  let allConcepts = thCollecs.flat();
  let totallength = allConcepts.length;
  console.log(totallength);

  // HOMONYMIE SUR LE MAIN LABEL
  let conceptNames = allConcepts.map(c => c.name);
  const duplicates = conceptNames.filter((item, index) => conceptNames.indexOf(item) !== index);
  const indexOfAll = (arr, val) => arr.reduce((acc, el, i) => (el === val ? [...acc, i] : acc), []);
  // duplicates.forEach(item => {
  //   const duplicatesIndexes = indexOfAll(conceptNames, item).map(h => allConcepts[h]);
  //   console.log(item, duplicatesIndexes);
  // });
  const duplicatesIndexes = duplicates.map(item => getPairs(indexOfAll(conceptNames, item).map(h => allConcepts[h]._id)).map(pair => ({_from: pair[0], _to: pair[1], type: "homonym", provenance: "internal calculation"})));
  const relations = duplicatesIndexes.flat();

  const result = db.query({
    query: `
    FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
    `,
    bindVars: {
      toInsert: relations,
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));


}

async function testAiolidescriptions(thCollecs){
  let allConcepts = thCollecs.flat();
  let conceptNames = allConcepts.map(c => c.name);

  var nounInflector = new natural.NounInflector();
  var tokenizer = new natural.AggressiveTokenizerFr();

  // on tokenise chaque concept, on supprime les stopwords (de, et, la, ...), on singularise et ensuite en reconstruit la string
  // on fera subir le meme traitement aux descriptions aioli et ensuite on pourra comparer
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

  var aioliObjects = db.collection("aioli_objects");
  let listAioliObjects = aioliObjects.all().then(
    cursor => cursor.all()
  ).then(
    res => {
      let regions = res.filter(doc => doc.type == "Region" && Object.keys(doc.description).length > 0)
      //console.log(regions);

      let descriptions = regions.map(reg => ({[reg._id]: reg.description}));

      //Object.values(d
      let descriptionStrings = descriptions.map(d => ({[Object.keys(d)[0]]: JSON.stringify(Object.values(d))}) );
      //console.log(descriptionStrings);

      let cleanedDescriptions = descriptionStrings.map(item => {
      //descriptionStrings.forEach(item => {
        // let val = Object.values(item);
        // console.log(val);
        for (const [key, value] of Object.entries(item)) {
          //console.log(value);

          let tokenized = tokenizer.tokenize(value);
          let result = tokenized.filter(token =>
            stopwords.words.indexOf(token) === -1
          );
          let sing = result.map(token => nounInflector.singularize(token));
          let finalString = sing.join(" ");
          //console.log(result);
          // console.log(finalString);
          return ({[key]: finalString})
        }
      })

      //console.log(cleanedDescriptions);


      // stemmedConceptNames.forEach((concept, i) => {
      //   let tmp = cleanedDescriptions.filter(d => Object.values(d)[0].indexOf(concept) > -1 ).map(match => {
      //     console.log(conceptNames[i] + " FOUND IN " + Object.values(match)[0] + "\n");
      //     let relation = {_from: allConcepts[i]._id, _to: Object.keys(match)[0], provenance: "internal calculation"};
      //     return relation;
      //   })
      //   console.log(tmp);
      // });

      let matches = stemmedConceptNames.map((concept, i) => {
        let tmp = cleanedDescriptions.filter(d => Object.values(d)[0].indexOf(" " + concept + " ") > -1 && isNaN(concept) == true && concept.length > 2).map(match => {
          console.log(conceptNames[i] + " FOUND IN " + Object.values(match)[0] + "\n");
          let ambiguities = ["cours", "cadre", "niveau", "place"];
          let ambiguity = false;
          if(ambiguities.indexOf(allConcepts[i].name) > -1){
            ambiguity = true; // undefined, weak, medium, strong ?
          }
          let relation = {_from: allConcepts[i]._id, _to: Object.keys(match)[0], type: "vocabulary", provenance: {method: "internal calculation", timestamp: Date.now(), script: "SemanticLinker", function: "testAiolidescriptions", ambiguity: true}};
          return relation;
        })
        return tmp;
      });

      let relations = matches.filter(entry => entry.length > 0).flat();
      console.log(relations);

      const result = db.query({
        query: `
        FOR entry IN @toInsert INSERT entry INTO SemanticLinks RETURN 1
        `,
        bindVars: {
          toInsert: relations,
        }
      }).then(
        cursor => cursor.all()
      ).then(
        res => console.log(res));

      // let test = descriptions[200];
      // //let val = Object.values(test[0]);
      // console.log(Object.values(Object.values(test)[0]));
      //
      // let input = Object.values(Object.values(test)[0]).toString();
      //
      // var tokenizer = new natural.AggressiveTokenizerFr();
      // let tokenized = tokenizer.tokenize(input);
      // let result = tokenized.filter(token =>
      //   stopwords.words.indexOf(token) === -1
      // );
      // var nounInflector = new natural.NounInflector();
      // let sing = result.map(token => nounInflector.singularize(token));
      // let finalString = sing.join(" ");
      // console.log(result);
      // console.log(sing);

      //console.log(test);
      // let test = descriptions.forEach(desc => console.log(Object.entries(desc)))
    }
  )
}
