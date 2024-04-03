# TT-ArangoFeeder
Build arangoDB collections from Aioli and OpenTheso data

1) Run PrepareDB.js
2) Run OpenTheso_Synchronizer.js
3) Run Aioli_Synchronizer.js
4) Run rcc8_Synchronizer.js
5) Run SemanticsLinker.js

## Notes

### Starting the database
```bash
docker run -e ARANGO_ROOT_PASSWORD=<provide_some_passwd> -p 8529:8529 -v $(pwd)/Junnk:/var/lib/arangodb3 --rm -d --name arango arangodb/arangodb
```

Retrieve the generated database password out of the previous command and
edit the `dbaccess.js` in order to provide the required credentials
(note: by default the `login` is `root`.

Then create a database named out of the `database` entry you chose to provide
within the `dbaccess.js` file by 
* using the builtin Arangodb UI by opening `http://127.0.0.1:8529` with your
  favorite webbrowser,
* identifying and 
* using the `DATABASES` tab of the dashboard.

### Uploading content to the database
Eventually proceed with uploading content to the database by running

```bash
npm i
node PrepareDB.js
node OpenTheso_Synchronizer.js
node Aioli_Synchronizer.js
node rcc8_Synchronizer.js
node SemanticsLinker.js
```

### Gracefully halting the database
Refer to 
[this stackoverflow thread](https://stackoverflow.com/questions/31627932/how-to-stop-and-start-arangodb-server-in-arangodb-docker-container)
but the method boils down to
- using the ArangoDB web interface select the support option from the left
- select the "Rest API" tab and scroll down to the "Administration" entry
- select the "DELETE /_admin/shutdown" option,
- this opens an area that has a button labeled "Try it out!"
- hit the large "Execute" button
- this should kill the UI AND the docker container should exit
