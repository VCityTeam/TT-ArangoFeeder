var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
//var aql = require('arangojs/aql');
var aql = require('arangojs').aql;
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');

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
    //tmp(res); //linkAllThesauri
    loadAllThesauri(res);

  }
)

// Liste les paires possibles à partir d'un array
let getPairs = (arr) => arr.map( (v, i) => arr.slice(i + 1).map(w => [v, w]) ).flat();

async function loadAllThesauri(thesauri){
  // array avec le nom des thesauri disponible dans ma BDD
  let thNames = thesauri.map(t => t._key);

  //thNames.forEach((name) => { thCollecs[name] = db.collection(name)});
  let thCollecs = [];
  for (let k=0; k<thNames.length; k++){
    let cursor = await db.collection(thNames[k]).all();
    let theso = await cursor.all();
    thCollecs.push(theso);
    if(k == thNames.length - 1){
      next(thCollecs);
    }
  }

}

async function next(thCollecs){
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

  //var miaou = [{ _from: 'th57/ndp5g4fxtwttkqst2zr60w4', _to: 'th18/27323', type: 'related to', provenance: 'internal calculation'}, { _from: 'th57/ndp5g4fxtwttkqst2zr60w4', _to: 'th18/27324', type: 'related to',provenance: 'internal calculation' },{ _from: 'th57/ndp5g4fxtwttkqst2zr60w4', _to: 'th18/27327', type: 'related to', provenance: 'internal calculation'}]


  // stmt = db._createStatement({query: "for i in @list return i"});
  // stmt.bind('list', miaou);

  // INCLUSION
  // FONCTIONNE !!

  let conceptNames = flatten.map(c => c.name);
  const inclusions = flatten.map((item, i) => {
    let includedIn = flatten.filter((c, index) => {

      let nameA = item.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');
      let nameB = c.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');

      let regA = new RegExp('\\b' + nameA + '\\b');
      let regB = new RegExp('\\b' + nameB + '\\b');

      let found_AinB = regA.test(nameB); // false
      if(found_AinB && conceptNames.indexOf(c.name) !== i && nameA.length > 3 && nameB.length > 3){
        return c._id
      }
    });

    return [item._id, includedIn];
  });
  const notnull = inclusions.filter(n => n[1].length > 0);
  const j = notnull.map(d => d[1].map(correspondances => ({_from: d[0], _to: correspondances._id, type: 'related to', provenance: 'internal calculation'}))).flat();
  console.log(j);

  const result = db.query({
    query: `
    FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
    `,
    bindVars: {
      toInsert: j,
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));

  // const cursor = await db.query(aql`FOR entry IN ${j} INSERT entry INTO intraTheso_relations RETURN 1`);
  // const result = await cursor.all();

  // const result = db.query({
  //   query: `
  //   FOR entry IN @toInsert INSERT entry INTO intraTheso_relations RETURN 1
  //   `,
  //   bindVars: {
  //     "@toInsert": j,
  //   }
  // }).then(
  //   cursor => cursor.all()
  // ).then(
  //   res => console.log(res));





}

async function tmp(thesauri){
  let thCollecs = [];

  // array avec le nom des thesauri disponible dans ma BDD
  let thNames = thesauri.map(t => t._key);
  thNames.forEach((name) => { thCollecs[name] = db.collection(name)});

  let pairs = getPairs(thNames);

  for (let k=0; k<pairs.length; k++){
    let pair = pairs[k];
    const collecA = thCollecs[pair[0]];
    const collecB = thCollecs[pair[1]];

    const cursor = await db.query(aql`
      FOR a IN ${collecA}
        FOR b IN ${collecB}
          RETURN {
            first: a,
            second: b,
            }
      `);
    const result = await cursor.all();

    result.forEach((item, i) => {
      if(i == result.length){
        console.log (" LAAAAAAAAAASSSTTTTT ");
      }
      let nameA = item.first.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');
      let nameB = item.second.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');
      console.log(nameA, nameB);

      let regA = new RegExp('\\b' + nameA + '\\b');
      let regB = new RegExp('\\b' + nameB + '\\b');

      let found_AinB = regA.test(nameB); // false
      let found_BinA = regB.test(nameA); // false

      let toSave = [];

      if(found_AinB && nameA.length > 3 && nameB.length > 3){
        console.log(nameA + " inside " + nameB + " ? " + found_AinB);
        //toSave.push({_from: `${item.first._id}`, _to: `${item.second._id}`, type: 'related to', provenance: 'internal calculation'});
      }

      if(found_BinA && nameA.length > 3 && nameB.length > 3){
        console.log(nameB + " inside " + nameA + " ? " + found_BinA);
        //toSave.push({_from: `${item.second._id}`, _to: `${item.first._id}`, type: 'related to', provenance: 'internal calculation'});
      }
    });

  }
}
