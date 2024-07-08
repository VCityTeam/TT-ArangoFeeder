// Database
var config = {
  collections: {
    aioliObjects: {
      name: 'aioli_objects',
      type: 'node'
    },
    aioliUsers: {
      name: 'aioli_users',
      type: 'node'
    },
    aioliRelations: {
      name: 'aioli_relations',
      type: 'edge'
    },
    thesauri: {
      name: 'Thesauri',
      type: 'node'
    },
    semanticLinks: {
      name: 'SemanticLinks',
      type: 'edge'
    },
    intraThesoRelations: {
      name: 'intraTheso_relations',
      type: 'edge'
    }
  },

  nodesColors: {
    heritageAsset: '#ef476f',
    project: '#ffd166',
    group: '#06d6a0',
    layer: '#118ab2',
    user: '#b842b8'
  },

  annotationColors: {
    red: '#9c2435',
    orange: '#a66727',
    blue: '#173e8c',
    cyan: '#56b4bd',
    green: '#247b2e',
    lime: '#6fc635',
    yellow: '#c7c941',
    purple: '#5b28a9',
    gray: '#575a5b'
  }
}

module.exports = config;
