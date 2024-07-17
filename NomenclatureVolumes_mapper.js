var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
var aql = require('arangojs').aql;
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');
var natural = require('natural');
const stopwords = require('natural/lib/natural/util/stopwords_fr');


// 1. Connect to the database
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

async function loadData(url){
  try {
    const data = await fs.promises.readFile(url, 'utf8');
    return data;
  } catch (error) {
    return error;
  }
}

async function testNomenclatureData(file){
  let data = await loadData('./data_12-12-23/'+ file);
  let nomenclature = JSON.parse(data);
  let jsonEntries = Object.entries(nomenclature);

  let cursor = await db.collection("th13").all();
  let theso = await cursor.all();

  let names = Object.values(nomenclature.volumes).map(value => value.name.replaceAll(" ", ""));
  names.forEach(n => console.log(n));

  let correspondances = theso.map(concept => {
    let index = names.indexOf(concept.name.replaceAll(" ", ""))
    if( index > -1){
      let bbox = {
        position: nomenclature.volumes[index].position,
        rotation: nomenclature.volumes[index].rotation,
        scale: nomenclature.volumes[index].scale
      }
      concept.bbox = bbox;
      return concept;
    }
  });
  correspondances = correspondances.filter( c => c !== undefined);
  //console.log(correspondances);

  const result = db.query({
    query: `
    FOR entry IN @toUpdate UPDATE entry IN th13
    `,
    bindVars: {
      toUpdate: correspondances,
    }
  }).then(
    cursor => cursor.all()
  ).then(
    res => console.log(res));


}

testNomenclatureData("nomenclatureVolumes.json");
