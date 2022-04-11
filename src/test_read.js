import api, { queryProjectMeta, queryProject, queryDripsConfigByID, querySplitsBySender, querySplitsByReceiver, queryDripsByReceiver } from './api.js'

console.log("Hello World Read")

var projectAddress = "0x750700d592178da5762254cc5eef195415bdc55d"
var dripsReceiverAddress = "0x48cb1a8c08066d7cf200ff01d3bea689a05010f0"


testQueryDripsByReceiver(dripsReceiverAddress)
//testQueryProject(projectAddress)

async function testQueryDripsByReceiver (receiver) {
  try {
    const resp = await api({ query: queryDripsByReceiver, variables: { receiver, first: 100 } })
    console.log(resp.data?.dripsEntries)
    return resp.data?.dripsEntries || []
  } catch (e) {
    console.error(e)
    throw e
  }
}

async function testQueryProject (projectAddress) {
  try {
    // check api...
    const resp = await api({ query: queryProject, variables: { id: projectAddress } })

    if (resp.data?.fundingProject) {
      console.log(resp.data.fundingProject)
      return resp.data.fundingProject
    }
  } catch (e) {
    console.error('@getProject', e)
  }
}