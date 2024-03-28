var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');

const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

async function prepareDB(){
  const collections = await db.listCollections();
  const collectionsNames = collections.map(a => a.name);

  for (const [key, value] of Object.entries(config.collections)) {
    console.log(`${key}: ${value.name}`);
    if(!collectionsNames.includes(value.name)){
      // "we must create a collection named " + value.name + " whose type is " + value.type
      if(value.type == 'node'){
        db.createCollection(value.name).then(
          meta => console.log('Collection created:', meta),
          err => console.error('Failed to create collection:', err)
        );
      }
      else if(value.type == 'edge'){
        db.createEdgeCollection(value.name).then(
          meta => console.log('Collection created:', meta),
          err => console.error('Failed to create collection:', err)
        );
      }
      else{
        console.error("unknown collection type");
      }
    }

  }
  return collectionsNames;
}

prepareDB();
