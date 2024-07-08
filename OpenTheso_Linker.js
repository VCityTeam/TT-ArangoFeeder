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
     testHomonymes(thCollecs);
    }
    // if(k == 2){ // pour des tests rapides
    //   testHomonymes(thCollecs);
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
