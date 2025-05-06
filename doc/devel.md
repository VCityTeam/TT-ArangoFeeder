## Examples of ArangoDB queries with AQL


### Find in Aioli

Get all Aioli annotations whose description contains the word "nef"

```
FOR a IN aioli_objects
    LET descriptionsFields = (
        FILTER a.type == "Region"
        FOR attr IN ATTRIBUTES(a.description)
            RETURN attr
        )
    FOR d IN descriptionsFields
        FILTER CONTAINS(a.description[d], "nef")
        RETURN { field: d, val: a.description[d]}
```

### Find homonyms

Find homonyms including the altLabels of each concept

```
FOR a IN th56
    LET labelsA = (
        FOR la IN a.labels
            RETURN la.label
    )
    FOR b IN th13
        LET labelsB = (
            FOR lb IN b.labels
                RETURN lb.label
        )

        // pour chaque concept de th56, stocke tous les labels. Pour chaque concept de th13, et pour chaque label de ce concept, vérifie s'il est dans l'un des labels des concepts de th56
        FOR c IN labelsB
            FILTER c IN labelsA
            RETURN {
                conceptA: a.name,
                conceptB: b.name
            }
```

### Find semantic inclusions

Find relations like "A inside B" (e.g. "arc" inside "arc doubleau"), excluding short words and digits

```
FOR a IN th56
    LET contained = (
        FOR b IN th13
            FILTER REGEX_TEST(a.name, CONCAT(['\\b', b.name, '\\b'])) AND CHAR_LENGTH(a.name) > 3 AND CHAR_LENGTH(b.name) > 3  AND !REGEX_TEST(a.name, '[[:digit:]]')
                RETURN {
                    _from: a._id,
                    _to: b._id,
                    type: "related to",
                    provenance: "internal calculation"
                }
    )

    LET container = (
        FOR b IN th13
            FILTER REGEX_TEST(b.name, CONCAT(['\\b', a.name, '\\b'])) AND CHAR_LENGTH(a.name) > 3 AND CHAR_LENGTH(b.name) > 3 AND !REGEX_TEST(b.name, '[[:digit:]]')
                RETURN {
                    _from: b._id,
                    _to: a._id,
                    type: "related to",
                    provenance: "internal calculation"
                }
    )

    LET total = UNION(contained, container)

    FOR item IN total
        FILTER LENGTH(item) > 0
            RETURN item
```

### Export Aioli

Get all aioli nodes and all aioli relations and return it JSON formatted

```
LET NODES_AIOLI = (
    FOR a IN aioli_objects
        RETURN {id: a._id, data: a}
    )

LET USERS_AIOLI = (
    FOR u IN aioli_users
        RETURN {id: u._id, data: u}
    )

LET NODES = APPEND(NODES_AIOLI, USERS_AIOLI)

LET LINKS = (
    FOR link IN aioli_relations

        RETURN {source: link._from, target: link._to, data: link}
    )

RETURN {nodes: NODES, links: LINKS}
```
