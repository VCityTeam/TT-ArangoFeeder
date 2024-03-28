var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');

// UNSAFE, VERY INSECURE (DIASBLE CERTIFICATE VERIFICATIONS !)
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

// 1. Connect to the database
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

var objects = db.collection("aioli_objects");
var users = db.collection("aioli_users");
var relations = db.collection("aioli_relations");

//load openTheso data
async function loadData(url){
  try {
    const data = await fs.promises.readFile(url, 'utf8');
    return data;
  } catch (error) {
    return error;
  }
}

/*
Fonction destinée à sauver les utilisateurs d'aioli sous forme de fiches
dans la collection aioli_users
Renvoie un message quand la requete est terminée
*/
async function saveUserData(user){
  const promise = new Promise ((resolve) => {

      let id = user._id;

      // on récupère l'id de l'utilisateur pour chercher la fiche correspondante dans la BDD
      db.query(`RETURN DOCUMENT('aioli_users/${id}')`).then(
        cursor => cursor.all()
      ).then(
        res => {
          // d'abord on prépare une fiche à jour pour stocker les informations de l'utilisateur
          let doc = {
            _key: id,
            type: "User",
            name: user.username,
            firstName: user.fname ? user.fname : "unnamed",
            lastName: user.lname ? user.lname : "unnamed",
            function: user.function ? user.function : null,
            institut: user.institut ? user.institut : null,
            phone: user.phone ? user.phone : null,
            username: user.username,
            mail: user.mail ? user.mail : null,
            address: user.address ? user.address : null,
            collaborators: user.collaborators,
            timestamp: user.member_since,
            color: config.nodesColors.user
          }

          if(!res[0]){
            // cet utilisateur n'est pas encore référencé dans la BDD
            // donc on crée une nouvelle fiche
            users.save(doc).then(
              meta => console.log("User saved: ", meta._rev),
              err => console.error("Failed to save the user: ", err)
            );
            resolve("User saved");
          }
          else{
            // il existe déjà il faut juste l'actualiser
            // donc on met à jour la fiche existante
            users.update(id, doc).then(
              meta => console.log("User updated: ", meta._rev),
              err => console.error("Failed to update the user: ", err)
            );
            resolve("User updated");
          }
        },
        err => {
          console.error("Failed to execute the DB query: ", err);
          resolve("An error happened");
        }
      );

  });
  return promise;
}

/*
Fonction destinée à récupérer les heritage assets publics d'aioli
pour les sauver sous forme de fiches dans la collection aioli_objects
*/
async function saveHeritageData(heritage){
  const promise = new Promise((resolve) => {
    let id = heritage._id;
    let owner = heritage.owner;
    // on récupère l'id du heritage asset pour chercher la fiche correspondante dans la BDD
    db.query(`RETURN DOCUMENT('aioli_objects/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // d'abord on prépare une fiche à jour pour stocker les informations de l'heritage asset
        let doc = {
          _key: id,
          type: "Heritage asset",
          name: heritage.title ? heritage.title : "unnamed",
          title: heritage.title ? heritage.title : "unnamed",
          reference: heritage.reference ? heritage.reference : null,
          subcategory: heritage.subcategory ? heritage.subcategory : null,
          subsubcategory: heritage.subsubcategory ? heritage.subsubcategory : null,
          country: heritage.country ? heritage.country : null,
          town: heritage.town ? heritage.town : null,
          description: heritage.description ? heritage.description : null,
          category: heritage.category ? heritage.category : null,
          thumbnail: null, // to do: save the thumbnail path with heritage.extension
          owner: heritage.owner ? heritage.owner : null,
          visibility: heritage.visibility ? heritage.visibility : "public",
          lat: heritage.lat ? heritage.lat : null ,
          long: heritage.long ? heritage.long : null,
          timestamp: heritage.timestamp_creation,
          color: config.nodesColors.heritageAsset
        }

        if(!res[0]){
          // ce heritage asset n'est pas déjà référencé dans la BDD
          // donc on crée une nouvelle fiche
          objects.save(doc).then(
            meta => {
              console.log("Heritage saved: ", meta._rev);
              resolve(id);
            },
            err => {
              console.error("Failed to save the heritage: ", err);
              resolve("error");
            }
          );
        }
        else{
          // il existe déjà il faut juste l'actualiser
          // donc on met à jour la fiche existante
          objects.update(id, doc).then(
            meta => {
              console.log("Heritage updated: ", meta._rev),
              resolve(id);
            },
            err => {
              console.error("Failed to update the heritage: ", err);
              resolve("error");
            }
          );
        }
      },
      err => {
        console.error("Failed to execute the DB query: ", err);
        resolve("error");
      }
    )
  });
  return promise;
}

async function saveProjectData(project){
  const promise = new Promise ((resolve) => {
    let id = project._id;
    let owner = project.owner;

    db.query(`RETURN DOCUMENT('aioli_objects/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // d'abord on prépare une fiche à jour pour stocker les informations du projet
        let doc = {
          _key: id,
          type: "Project",
          name: project.title ? project.title : "unnamed",
          title: project.title ? project.title : "unnamed",
          description: project.description ? project.description : null,
          owner: project.owner ? project.owner : null,
          acquisitions: project.acqs,
          sharing: project.users,
          visibility: project.visibility ? project.visibility : "public",
          access: project.access ? project.access: null,
          extension: project.extension,
          imagesPath: null, // to do: save the path to acq images,
          heritage: project.heritage ? project.heritage : null,
          timestamp: project.timestamp,
          color: config.nodesColors.project
        }

        if(!res[0]){
          // ce heritage asset n'est pas déjà référencé dans la BDD
          // donc on crée une nouvelle fiche
          objects.save(doc).then(
            meta => {
              console.log("Project saved: ", meta._rev);
              resolve(id);
            },
            err => {
              console.error("Failed to save the project: ", err);
              resolve("error");
            }
          );
        }
        else{
          // il existe déjà il faut juste l'actualiser
          // donc on met à jour la fiche existante
          objects.update(id, doc).then(
            meta => {
              console.log("Project updated: ", meta._rev),
              resolve(id);
            },
            err => {
              console.error("Failed to update the project: ", err);
              resolve("error");
            }
          );
        }

      },
      err => {
        console.error("Failed to execute the DB query: ", err);
        resolve("error");
      }
    );

  });
  return promise;
}

async function saveGroupData(group){
  const promise = new Promise ((resolve) => {
    let id = group._id;
    let owner = group.owner;

    db.query(`RETURN DOCUMENT('aioli_objects/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // d'abord on prépare une fiche à jour pour stocker les informations du groupe
        let doc = {
          _key: id,
          type: "Group",
          name: group.name ? group.name : "unnamed",
          project: group.project ? group.project : null,
          owner: group.owner ? group.owner : null,
          color: config.nodesColors.group
        }

        if(!res[0]){
          // ce groupe n'est pas déjà référencé dans la BDD
          // donc on crée une nouvelle fiche
          objects.save(doc).then(
            meta => {
              console.log("Group saved: ", meta._rev);
              resolve(id);
            },
            err => {
              console.error("Failed to save the group: ", err);
              resolve("error");
            }
          );
        }
        else{
          // il existe déjà il faut juste l'actualiser
          // donc on met à jour la fiche existante
          objects.update(id, doc).then(
            meta => {
              console.log("Group updated: ", meta._rev),
              resolve(id);
            },
            err => {
              console.error("Failed to update the group: ", err);
              resolve("error");
            }
          );
        }

      },
      err => {
        console.error("Failed to execute the DB query: ", err);
        resolve("error");
      }
    );

  });
  return promise;
}

async function saveLayerData(layer){
  const promise = new Promise ((resolve) => {
    let id = layer._id;
    let owner = layer.owner;

    db.query(`RETURN DOCUMENT('aioli_objects/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // d'abord on prépare une fiche à jour pour stocker les informations du calque
        let doc = {
          _key: id,
          type: "Layer",
          name: layer.name ? layer.name : "unnamed",
          project: layer.project ? layer.project : null,
          group: layer.parent ? layer.parent : null,
          owner: layer.owner ? layer.owner : null,
          color: config.nodesColors.layer
        }

        if(!res[0]){
          // ce calque n'est pas déjà référencé dans la BDD
          // donc on crée une nouvelle fiche
          objects.save(doc).then(
            meta => {
              console.log("Layer saved: ", meta._rev);
              resolve(id);
            },
            err => {
              console.error("Failed to save the layer: ", err);
              resolve("error");
            }
          );
        }
        else{
          // il existe déjà il faut juste l'actualiser
          // donc on met à jour la fiche existante
          objects.update(id, doc).then(
            meta => {
              console.log("Layer updated: ", meta._rev),
              resolve(id);
            },
            err => {
              console.error("Failed to update the layer: ", err);
              resolve("error");
            }
          );
        }

      },
      err => {
        console.error("Failed to execute the DB query: ", err);
        resolve("error");
      }
    );

  });
  return promise;
}

async function saveRegionData(region, userfields){
  const promise = new Promise ((resolve) => {
    let id = region._id;
    let owner = region.owner;

    db.query(`RETURN DOCUMENT('aioli_objects/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        //let regionDescription = {}
        //console.log(region.user_data);

        // d'abord on prépare une fiche à jour pour stocker les informations de la region
        let doc = {
          _key: id,
          type: "Region",
          name: region.name ? region.name : "unnamed",
          project: region.project ? region.project : null,
          layer: region.parent ? region.parent : null,
          owner: region.owner ? region.owner : null,
          material: region.material,
          description: {},
          color: config.annotationColors[region.material]
        }
        console.log(doc);
        for(const field in region.user_data){
          let fieldName = "unnamed_"+field;
          if(userfields && field){
            if(userfields[field] && userfields[field]["name"]){
              fieldName = userfields[field]["name"];
            }
          }
          let fieldValue = region.user_data[field];
          doc.description[fieldName] = fieldValue;
          //doc[fieldName] = fieldValue; // TEST TEMPORAIRE POUR AVOIR UNE STRUCTURE PLUS "PLATE" POUR LA VISU. IL FAUDRA REVENIR A L'ETAT D'AVANT QUAND JE DEVELOPPERAI NOTRE PROPRE VIEWER
        }

        if(!res[0]){
          // cette region n'est pas déjà référencé dans la BDD
          // donc on crée une nouvelle fiche
          objects.save(doc).then(
            meta => {
              console.log("Region saved: ", meta._rev);
              resolve(id);
            },
            err => {
              console.error("Failed to save the region: ", err);
              resolve("error");
            }
          );
        }
        else{
          // elle existe déjà il faut juste l'actualiser
          // donc on met à jour la fiche existante
          objects.update(id, doc).then(
            meta => {
              console.log("Region updated: ", meta._rev),
              resolve(id);
            },
            err => {
              console.error("Failed to update the region: ", err);
              resolve("error");
            }
          );
        }

      },
      err => {
        console.error("Failed to execute the DB query: ", err);
        resolve("error");
      }
    );

  });
  return promise;
}

async function getUserId(username){
  const promise = new Promise ((resolve) => {
    let idUser = db.query(`FOR u IN aioli_users FILTER u.username == '${username}' RETURN u._key`).then(
      cursor => cursor.all()
    ).then(
      res => {
        let idUser = res[0] ? res[0] : null;
        resolve(idUser);
      },
      err => {
        console.error('Failed to execute this query: ', err);
        resolve(null);
      }
    );
  });
  return promise;
}

async function isHeritagePublic(id){
  const promise = new Promise ((resolve) => {
    let ha = db.query(`FOR o IN aioli_objects FILTER o.type == 'Heritage asset' AND o._key == '${id}' RETURN o._key`).then(
      cursor => cursor.all()
    ).then(
      res => {
        let isPublic = res[0] ? true : false;
        resolve(isPublic);
      },
      err => {
        console.error('Failed to execute this query: ', err);
        resolve(null);
      }
    );
  });
  return promise;
}

async function handleUsers(file){
  let data = await loadData('./data_12-12-23/' + file);
  let parsedData = JSON.parse(data);
  let usersData = parsedData.rows; // array qui contient les fiches de chaque utilisateur

  // pour chaque utilisateur de cette liste on va créer une fiche ou actualiser une fiche existante
  let count = 0;
  for (let i=0; i<usersData.length; i++){
    let dbUsersResponse = await saveUserData(usersData[i].value);
    count += 1;

    //une fois qu'on a bien mis à jour toutes les fiches (et donc qu'on est sûr que tous les users existent)
    // on peut mettre à jour leurs relations
    if(count == usersData.length){

      for (let j=0; j<usersData.length; j++){
        let user = usersData[j].value;
        let userId = usersData[j].id;
        let collaborators = user.collaborators;
        if(collaborators){
          for (let k=0; k<collaborators.length; k++){
            let collabId = await getUserId(collaborators[k]);
            //on crée une relation entre l'utilisateur userId et le collaborateur collabId
            //collaborations.save({_from: `aioli_users/${userId}`, _to: `aioli_users/${collabId}`, nature: 'collaborator'}).then(

            // BUG CHAMPS NULLS, A REVOIR
            // if(userId !== null && collabId !== null) {
            //
            //   relations.save({_from: `aioli_users/${userId}`, _to: `aioli_users/${collabId}`, nature: 'collaboratesWith'}).then(
            //     meta => console.log(meta),
            //     err => console.error('Failed: ', err)
            //
            //   );
            // }

          }
        }
      }
    }
  }
}

async function handleHeritages(file){
  let data = await loadData('./data_12-12-23/' + file);
  let parsedData = JSON.parse(data);
  let heritages = parsedData.rows; //array qui contient les fiches de chaque heritage asset

  for (let i=0; i<heritages.length; i++){
    let dbHeritageResponse = await saveHeritageData(heritages[i].value);

    if(dbHeritageResponse !== "error"){
      // maintenant qu'on a la fiche, il va falloir vérifier si le créateur de l'asset est déjà référencé dans aioli_users
      // ensuite, on pourra insérer une relation entre le heritage et son propriétaire si ce n'est pas déjà fait
      let ownerId = await getUserId(heritages[i].value.owner);
      if(ownerId == null){
        //the user doesn't exist anymore, but the heritage is still in aioli db
      }
      //on crée une relation entre le heritage asset id et son propriétaire ownerId
      //ownerships.save({_from: `aioli_objects/${dbHeritageResponse}`, _to: `aioli_users/${ownerId}`, nature: 'owner'}).then(

      // BUG CHAMPS NULLS A REVOIR
      if(ownerId !== null){
        relations.save({_from: `aioli_users/${ownerId}`, _to: `aioli_objects/${dbHeritageResponse}`, nature: 'owns'}).then(
          meta => console.log(meta),
          err => console.error('Failed: ', err)
        );
      }

    }
  }
}

async function handleProjects(file){
  let data = await loadData('./data_12-12-23/' + file);
  let parsedData = JSON.parse(data);
  let projects = parsedData.rows; //array qui contient les fiches de chaque projet

  for (let i=0; i<projects.length; i++){
    let dbProjectsResponse = await saveProjectData(projects[i].value);

    if(dbProjectsResponse !== "error"){
      // maintenant qu'on a la fiche, il va falloir vérifier si le créateur de l'asset est déjà référencé dans aioli_users
      // ensuite, on pourra insérer une relation entre le projet et son propriétaire si ce n'est pas déjà fait
      let ownerId = await getUserId(projects[i].value.owner);
      if(ownerId == null){
        //the user doesn't exist anymore, but the project is still in aioli db
      }
      //on crée une relation entre le projet et son propriétaire
      //ownerships.save({_from: `aioli_objects/${dbProjectsResponse}`, _to: `aioli_users/${ownerId}`, nature: 'owner'}).then(

      // BUG CHAMPS NULLS A REVOIR
      if(ownerId !== null){
        relations.save({_from: `aioli_users/${ownerId}`, _to: `aioli_objects/${dbProjectsResponse}`, nature: 'owns'}).then(
          // meta => console.log(meta),
          // err => console.error('Failed: ', err)
        );
      }


      let users = projects[i].value.users;
      for (let j=0; j<users.length; j++){
        let userId = await getUserId(users[j]);
        if(userId == null){
          //the user doesn't exist anymore, but the project is still in aioli db
        }
        //on crée une relation entre le projet et son propriétaire
        //ownerships.save({_from: `aioli_objects/${dbProjectsResponse}`, _to: `aioli_users/${userId}`, nature: 'sharing'}).then(
        // BUG CHAMPS NULLS A REVOIR
        if(userId !== null){
          relations.save({_from: `aioli_objects/${dbProjectsResponse}`, _to: `aioli_users/${userId}`, nature: 'isSharedWith'}).then(
            // meta => console.log(meta),
            // err => console.error('Failed: ', err)
          );
        }

      }

      // AJOUTER HIERARCHIE ENTRE LES PROJETS ET LES HERITAGES
      let heritage = projects[i].value.heritage;
      if(heritage !== "none" && heritage !== null){
        let isHaPublic = await isHeritagePublic(heritage);
        console.log(isHaPublic);
        if(isHaPublic == true){
          //on crée une relation entre le heritage et le projet
          //hierarchies.save({_from: `aioli_objects/${heritage}`, _to: `aioli_objects/${dbProjectsResponse}`, nature: 'contain'}).then(
          relations.save({_from: `aioli_objects/${heritage}`, _to: `aioli_objects/${dbProjectsResponse}`, nature: 'contains'}).then(
            // meta => console.log(meta),
            // err => console.error('Failed: ', err)
          );
        }
      }
      let groups = await loadGroups(dbProjectsResponse);
    }

    // ici groupes?
    //loadGroups(projects[i].value._id);
  }
}

async function handleGroups(file, projectId){
    try {
      console.log(projectId);
      let data = await loadData('./data_12-12-23/' + file);
      //console.log(data);

      let parsedData = JSON.parse(data);
      let groups = parsedData.rows; //array qui contient les fiches de chaque groupe
      for (let i=0; i<groups.length; i++){
        let dbGroupsReponse = await saveGroupData(groups[i].value);
        if(dbGroupsReponse !== "error"){
          // maintenant qu'on a la fiche, il va falloir créer une relation entre le projet et ce groupe
          let groupId = groups[i].value._id;
          let projectId = groups[i].value.project;
          //hierarchies.save({_from: `aioli_objects/${projectId}`, _to: `aioli_objects/${dbGroupsReponse}`, nature: 'contain'}).then(
          relations.save({_from: `aioli_objects/${projectId}`, _to: `aioli_objects/${dbGroupsReponse}`, nature: 'contains'}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );

          // puis vérifier si le créateur de l'asset est déjà référencé dans aioli_users
          // ensuite, on pourra insérer une relation entre le groupe et son propriétaire si ce n'est pas déjà fait
          let ownerId = await getUserId(groups[i].value.owner);
          if(ownerId == null){
            //the user doesn't exist anymore, but the group is still in aioli db
          }
          //on crée une relation entre le groupe et son propriétaire
          //ownerships.save({_from: `aioli_objects/${dbGroupsReponse}`, _to: `aioli_users/${ownerId}`, nature: 'owner'}).then(

          // BUG CHAMPS NULLS A REVOIR
          if(ownerId !== null){
            relations.save({_from: `aioli_users/${ownerId}`, _to: `aioli_objects/${dbGroupsReponse}`, nature: 'owns'}).then(
              meta => console.log(meta),
              err => console.error('Failed: ', err)
            );
          }


          let layers = await loadLayers(dbGroupsReponse);
        }
      }
      fs.unlink('./data_12-12-23/groups_'+projectId+'.json', function(err){
        console.log(err);
      });

    } catch(e){
      console.log(e);
    }
}

async function handleLayers(file, groupId){
    try {
      console.log(groupId);
      let data = await loadData('./data_12-12-23/' + file);
      //console.log(data);

      let parsedData = JSON.parse(data);
      let layers = parsedData.rows; //array qui contient les fiches de chaque groupe
      for (let i=0; i<layers.length; i++){
        let dbLayersReponse = await saveLayerData(layers[i].value);
        if(dbLayersReponse !== "error"){
          // maintenant qu'on a la fiche, il va falloir créer une relation entre le projet et ce groupe
          //let layerId = layers[i].value._id;
          //let projectId = layers[i].value.project;
          //hierarchies.save({_from: `aioli_objects/${groupId}`, _to: `aioli_objects/${dbLayersReponse}`, nature: 'contain'}).then(
          relations.save({_from: `aioli_objects/${groupId}`, _to: `aioli_objects/${dbLayersReponse}`, nature: 'contains'}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );

          // puis vérifier si le créateur de l'asset est déjà référencé dans aioli_users
          // ensuite, on pourra insérer une relation entre le groupe et son propriétaire si ce n'est pas déjà fait
          // let ownerId = await getUserId(layers[i].value.owner);
          // if(ownerId == null){
          //   //the user doesn't exist anymore, but the group is still in aioli db
          // }
          //on crée une relation entre le groupe et son propriétaire
          // ownerships.save({_from: `aioli_objects/${dbGroupsReponse}`, _to: `aioli_users/${ownerId}`, nature: 'owner'}).then(
          //   meta => console.log(meta),
          //   err => console.error('Failed: ', err)
          // );
          let regions = await loadRegions(dbLayersReponse, layers[i].value.user_fields);
        }
      }
      fs.unlink('./data_12-12-23/layers_'+groupId+'.json', function(err){
        console.log(err);
      });

    } catch(e){
      console.log(e);
    }
}

async function handleRegions(file, layerId, userfields){
    try {
      console.log(layerId);
      let data = await loadData('./data_12-12-23/' + file);
      console.log(data);

      let parsedData = JSON.parse(data);
      let regions = parsedData.rows; //array qui contient les fiches de chaque groupe
      for (let i=0; i<regions.length; i++){
        let dbRegionsReponse = await saveRegionData(regions[i].value, userfields);
        if(dbRegionsReponse !== "error"){
          // maintenant qu'on a la fiche, il va falloir créer une relation entre le projet et ce groupe
          let layerId = regions[i].value.parent;
          console.log(layerId);
          // let projectId = regions[i].value.project;
          //hierarchies.save({_from: `aioli_objects/${layerId}`, _to: `aioli_objects/${dbRegionsReponse}`, nature: 'contain'}).then(
          relations.save({_from: `aioli_objects/${layerId}`, _to: `aioli_objects/${dbRegionsReponse}`, nature: 'contains'}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );

          // puis vérifier si le créateur de l'asset est déjà référencé dans aioli_users
          // ensuite, on pourra insérer une relation entre le groupe et son propriétaire si ce n'est pas déjà fait
          // let ownerId = await getUserId(layers[i].value.owner);
          // if(ownerId == null){
          //   //the user doesn't exist anymore, but the group is still in aioli db
          // }
          //on crée une relation entre le groupe et son propriétaire
          // ownerships.save({_from: `aioli_objects/${dbGroupsReponse}`, _to: `aioli_users/${ownerId}`, nature: 'owner'}).then(
          //   meta => console.log(meta),
          //   err => console.error('Failed: ', err)
          // );

        }
      }
      fs.unlink('./data_12-12-23/regions_'+layerId+'.json', function(err){
        console.log(err);
      });

    } catch(e){
      console.log(e);
    }
}


async function loadRegions(id, userfields){
  const regData = fs.createWriteStream('./data_12-12-23/regions_'+id+'.json');
  https.get('https://absinthe.aioli.map.cnrs.fr/couch/hierarchy/_design/queryfilter/_view/children?key="'+id+'"', rep => {
    rep.pipe(regData);
    console.log("done");
  });
  regData.on('finish', function(){
    console.log("End region writing");
    regData.end();
    handleRegions('regions_'+id+'.json', id, userfields);
  });
}

async function loadLayers(id){
  const layersData = fs.createWriteStream('./data_12-12-23/layers_'+id+'.json');
  https.get('https://absinthe.aioli.map.cnrs.fr/couch/hierarchy/_design/queryfilter/_view/children?key="'+id+'"', rep => {
    rep.pipe(layersData);
    console.log("done");
  });
  layersData.on('finish', function(){
    console.log("End layer writing");
    layersData.end();
    handleLayers('layers_'+id+'.json', id);
  });
}

async function loadGroups(id){

    const groupsData = fs.createWriteStream('./data_12-12-23/groups_'+id+'.json');
    https.get('https://absinthe.aioli.map.cnrs.fr/couch/hierarchy/_design/queryfilter/_view/groups_by_project?key="'+id+'"', rep => {
      rep.pipe(groupsData);
      console.log("done");
    });
    groupsData.on('finish', function(){
      console.log("End group writing");
      groupsData.end();
      handleGroups('groups_'+id+'.json', id);
    });

  // fs.unlink('./data/groups.json', function(err){
  //   if(err){
  //     console.error(err);
  //   }
  //   else{
  //     const groupsData = fs.createWriteStream('./data/groups.json');
  //     https.get('https://absinthe.aioli.map.cnrs.fr/couch/hierarchy/_design/queryfilter/_view/groups_by_project?key="'+id+'"', rep => {
  //       rep.pipe(groupsData);
  //       console.log("done");
  //     });
  //     groupsData.on('finish', function(){
  //       console.log("End group writing");
  //       groupsData.end();
  //       handleGroups('groups.json', id);
  //     });
  //   }
  //
  // });

}


async function loadAioliData(){
  // 1. On synchronise d'abord la liste des utilisateurs
  // on crée un fichier qui va recueillir les données streamées
  const userData = fs.createWriteStream('./data_12-12-23/AioliUsers.json');
  //https.get("https://absinthe.aioli.map.cnrs.fr/couch/users/_design/queryfilter/_view/public_users", rep => {
  https.get("https://absinthe.aioli.map.cnrs.fr/couch/users/_design/queryfilter/_view/all_users", rep => {
    rep.pipe(userData);
    console.log("get aioli users : done");
  });
  userData.on('finish', function(){
    // on arrete le stream quand l'écriture du fichier est terminée
    console.log("End users writing");
    userData.end();

    handleUsers('AioliUsers.json');
  });


  // 2. Ensuite les heritage assets publics
  const heritageData = fs.createWriteStream('./data_12-12-23/AioliHeritage.json');
  https.get("https://absinthe.aioli.map.cnrs.fr/couch/heritage/_design/queryfilter/_view/all_public", rep => {
    rep.pipe(heritageData);
    console.log("done");
  });
  heritageData.on('finish', function(){
    console.log("End heritage writing");
    heritageData.end();
    handleHeritages('AioliHeritage.json');
  });

  // 3. Ensuite les projets publics  (qui seront donc parfois liés à des heritage assets ET toujours à un utilisateur)
  const projectData = fs.createWriteStream('./data_12-12-23/AioliProjects.json');
  https.get("https://absinthe.aioli.map.cnrs.fr/couch/projects/_design/queryfilter/_view/all_public", rep => {
    rep.pipe(projectData);
    console.log("done");
  });
  projectData.on('finish', function(){
    console.log("End project writing");
    projectData.end();
    handleProjects('AioliProjects.json');
  });

}
loadAioliData();

// 0. Create server and listen
var server = https.createServer(function (req, res) {

    var url_parts = url.parse(req.url, true);
    var name = url_parts.query.name;
    if (name) {
        console.log('Name: ' +name);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({message: 'Hello ' +name + '!'}));
    } else {
        console.log('No name!');
        res.writeHead(200, {'Content-Type': 'text/html'});
        fs.readFile('index.html',function (err,data) {
          res.end(data);
        });
    }

}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
