import { createStore } from 'vuex'
import { toRaw } from 'vue'
import { ethers as Ethers } from 'ethers'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'
import api, { queryProjectMeta, queryProject } from '@/api'
import { validateSplits } from '@/utils'
// contracts
import { deploy, RadicleRegistry, DAI, DripsToken, DaiDripsHub } from '../../contracts'

let provider, signer, walletProvider

const network = deploy.NETWORK // JSON.parse(process.env.VUE_APP_CONTRACTS_DEPLOY).NETWORK
const networks = {
  mainnet: { id: 1, infura: 'wss://mainnet.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6' },
  rinkeby: { id: 4, infura: 'wss://rinkeby.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6' }
}

// setup web3 modal
const web3Modal = new Web3Modal({
  network, // optional
  cacheProvider: true, // optional
  providerOptions: { // required
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: '1cf5614cae9f49968fe604b818804be6' // required
      }
    }
  },
  theme: 'dark'
})

export default createStore({
  // modules: { },
  state () {
    return {
      address: null,
      addresses: [],

      // TODO - get this from the contract?
      splitsFractionMax: 1000000
    }
  },
  getters: {
    addrShort: (state) => (addr) => {
      // return ENS name or shortened 0x8888...8888
      return state.addresses[addr] ? state.addresses[addr]
        : addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '...'
    },
    isWalletAddr: (state) => (addr) => addr === state.address
  },
  mutations: {
    SIGN_IN (state, address) {
      state.address = address.toLowerCase()
    },
    SIGN_OUT (state) {
      state.address = null
    },
    SAVE_ADDRESS (state, { address, ens }) {
      const addresses = toRaw(state.addresses)
      addresses[address] = ens
      state.addresses = addresses
    }
    // SET_CONTRACTS (state, provider) {
    //   console.log('registry', RadicleRegistry.address)
    //   state.RadicleRegistryContract = new Ethers.Contract(RadicleRegistry.address, RadicleRegistry.abi, provider)
    // }
  },
  actions: {
    /* setup provider */
    async init ({ state, commit, dispatch }) {
      try {
        // auto-connect?
        if (web3Modal.cachedProvider) {
          await dispatch('connect')
        }

        // fallback provider
        if (!provider) {
          dispatch('setupFallbackProvider')
        }
      } catch (e) {
        console.error('@init', e)
      }
    },

    async setupFallbackProvider () {
      try {
        if (window.ethereum) {
          // metamask
          provider = new Ethers.providers.Web3Provider(window.ethereum)
        } else {
          // infura
          provider = new Ethers.getDefaultProvider(networks[network].infura)
        }
      } catch (e) {
        console.error(e)
      }
    },

    /* connect wallet */
    async connect ({ state, commit, dispatch }) {
      try {
        // connect and update provider, signer
        walletProvider = await web3Modal.connect()
        const provider = new Ethers.providers.Web3Provider(walletProvider)
        signer = provider.getSigner()

        // set user address
        const address = await signer.getAddress()
        commit('SIGN_IN', address)

        // commit('SET_CONTRACTS', provider)

        dispatch('listenToWalletProvider')
      } catch (e) {
        console.error('@connect', e)
        // clear in case
        dispatch('disconnect')
      }
    },

    /* disconnect wallet */
    disconnect ({ commit, dispatch }) {
      // clear so they can re-select from scratch
      web3Modal.clearCachedProvider()
      // if (walletProvider.off) {
      //   walletProvider.off('accountsChanged')
      //   walletProvider.off('disconnect')
      // }
      commit('SIGN_OUT')

      dispatch('setupFallbackProvider')
    },

    /* wallet events */
    listenToWalletProvider ({ commit, dispatch }) {
      if (!walletProvider?.on) return

      // account changed (or disconnected)
      walletProvider.on('accountsChanged', accounts => {
        console.log('accountsChanged', accounts)
        if (!accounts.length) {
          return dispatch('disconnect')
        }
        commit('SIGN_IN', accounts[0])
      })

      // changed network
      walletProvider.on('chainChanged', chainId => {
        console.log('network changed', chainId)
        // reload page so data is correct...
        window.location.reload()
      })

      // random disconnection? (doesn't fire on account disconnect)
      walletProvider.on('disconnect', error => {
        console.error('disconnected?', error)
        dispatch('disconnect')
      })
    },

    async createProject ({ state, dispatch }, { project, meta }) {
      try {
        // validate...
        project.drips = await validateSplits(project.drips, provider)

        // save full data to IPFS/pinata...
        const ipfsHash = await pinJSONToIPFS(meta)
        console.log('project meta:', `${process.env.VUE_APP_IPFS_GATEWAY}/ipfs/${ipfsHash}`)
        project.ipfsHash = ipfsHash

        // create project on chain
        const tx = await newProject({ owner: state.address, ...project })
        console.log('new project tx:', tx)

        return tx
      } catch (e) {
        console.error('@createProject', e)
        throw e
      }
    },

    waitForProjectCreate (_, tx) {
      const contract = getRadicleRegistryContract()

      // listen for project created by owner and return prj address
      return new Promise((resolve) => {
        // listener
        const onNewProject = async (projectAddress, projectOwner) => {
          console.log('@NewProject', projectAddress, projectOwner)

          // if owner matches tx sender...
          if (projectOwner.toLowerCase() === tx.from.toLowerCase()) {
            // unlisten and return address
            contract.off('NewProject', onNewProject)
            return resolve(projectAddress.toLowerCase())
          }
        }

        // listen!
        console.log('listen for new project...')
        contract.on('NewProject', onNewProject)
      })
    },

    async addProjectNFTType (_, { projectAddress, typeId = 0, limit = 999, minAmtPerSec = 0 }) {
      const contract = getProjectContract(projectAddress)
      const contractSigner = contract.connect(signer)
      return contractSigner.addType(typeId, limit, minAmtPerSec)
    },

    async getEventLog () {
      const contract = getRadicleRegistryContract()
      const events = await contract.queryFilter('NewProject')
      console.log('new project events:', events)
    },

    async getProject (_, projectAddress) {
      // check api
      try {
        // check api...
        const resp = await api({ query: queryProject, variables: { id: projectAddress } })

        if (resp.data?.fundingProject) {
          return resp.data?.fundingProject
        }

        console.log('API: project not found (just created?). Querying chain...', projectAddress)

        // check on-chain in case was just created...
        const contract = getProjectContract(projectAddress)
        const ipfsHash = await contract.contractURI()

        if (ipfsHash) {
          return { ipfsHash }
        }

        return null
      } catch (e) {
        console.error('@getProject', e)
        return null
      }
    },

    async getProjectMeta ({ dispatch }, { projectAddress, ipfsHash }) {
      try {
        if (!ipfsHash) {
          // fetch project...
          const resp = await api({ query: queryProjectMeta, variables: { id: projectAddress } })
          ipfsHash = resp.data.fundingProject.ipfsHash
        }

        if (!ipfsHash || ipfsHash.length !== 46) {
          console.warn(`Empty or malformed ipfsHash for ${projectAddress}: ${ipfsHash}`)
          return null
        }

        // fetch meta from ipfs...
        const meta = await fetch(`${process.env.VUE_APP_IPFS_GATEWAY}/ipfs/${ipfsHash}`)
        return meta.json()
      } catch (e) {
        console.error('@getProjectMeta', e)
        throw e
      }
    },

    async approveDAIContract ({ state, dispatch }, projectAddress) {
      try {
        if (!state.address) {
          await dispatch('connect')
        }

        const contract = new Ethers.Contract(DAI.address, DAI.abi, provider)
        const contractSigner = contract.connect(signer)
        // approve max amount
        const amount = Ethers.constants.MaxUint256
        const tx = await contractSigner.approve(projectAddress, amount)
        return tx
      } catch (e) {
        console.error('@approveDAIContract', e)
      }
    },

    async getProjectAllowance ({ state, dispatch }, projectAddress) {
      if (!state.address) await dispatch('connect')
      const daiContract = getDAIContract()
      return daiContract.allowance(state.address, projectAddress)
    },

    async mintProjectNFT ({ state, dispatch }, { projectAddress, typeId = 0, topUpAmt, amtPerSec }) {
      try {
        if (!state.address) {
          await dispatch('connect')
        }

        const contract = new Ethers.Contract(projectAddress, DripsToken.abi, provider)
        const contractSigner = contract.connect(signer)

        const tx = await contractSigner['mint(address,uint128,uint128,uint128)'](state.address, typeId, topUpAmt.toString(), amtPerSec.toString())
        return tx
      } catch (e) {
        console.error('@mintProjectNFT', e)
        if (e.message) {
          alert(e.message)
        }
        throw e
      }
    },

    async waitForNFTMint ({ state }, { projectAddress }) {
      const contract = getProjectContract(projectAddress)

      return new Promise((resolve) => {
        // listener
        const onNewNFT = async (newTokenId, nftReceiver, typeId, topUpAmt, amtPerSec) => {
          const nft = {
            tokenId: newTokenId.toString(),
            nftReceiver,
            projectAddress,
            typeId: typeId.toString(),
            topUpAmt: typeId.toString(),
            amtPerSec: amtPerSec.toString()
          }
          console.log('@NewNFT', nft)

          // if owner matches tx sender...
          if (nftReceiver.toLowerCase() === state.address.toLowerCase()) {
            contract.off('NewNFT', onNewNFT)
            return resolve(nft)
          }
        }

        // listen!
        console.log('listen for new NFT...')
        contract.on('NewNFT', onNewNFT)
      })
    },

    async collectProjectFunds (_, { projectAddress }) {
      try {
        const contract = getProjectContract(projectAddress)
        const contractSigner = contract.connect(signer)

        const tx = await contractSigner.collect()
        console.log('collect tx', tx)
        console.log(await tx.wait())
      } catch (e) {
        console.error('@collectProjectFunds', e)
        throw e
      }
    },

    async getNFTType (_, { projectAddress, nftTypeId = 0 }) {
      try {
        const contract = getProjectContract(projectAddress)
        return await contract.nftTypes(nftTypeId)
      } catch (e) {
        console.error('@getNFTType', e)
        throw e
      }
    },

    async getNFTBalance (_, { projectAddress, tokenId }) {
      try {
        const contract = getProjectContract(projectAddress)
        return await contract.withdrawable(tokenId)
      } catch (e) {
        console.error('@getNFTBalance', e, arguments)
      }
    },

    async nftTopUp ({ state, dispatch }, { projectAddress, tokenId, amountWei }) {
      try {
        if (!signer) await dispatch('connect')

        // determine allowance
        const daiContract = getDAIContract()
        const allowance = await daiContract.allowance(state.address, projectAddress)

        if (allowance.lt(amountWei)) {
          alert("Your top-up amount is greater than what you've allowed the project to spend.")
          throw new Error('topup amount < allowance')
        }

        const contract = getProjectContract(projectAddress)
        const contractSigner = contract.connect(signer)
        // console.log('top up', projectAddress, tokenId, amountWei)
        // go
        const tx = await contractSigner['topUp(uint256,uint128)'](tokenId, amountWei)
        return tx
      } catch (e) {
        console.error('@nftTopUp', e)
        throw e
      }
    },

    async nftWithdraw (_, { projectAddress, tokenId, amountWei }) {
      try {
        // determine amount withdrawable
        const contract = getProjectContract(projectAddress)
        const withdrawable = await contract.withdrawable(tokenId)

        if (withdrawable.lt(amountWei)) {
          alert(`You can only withdraw ${Ethers.utils.formatEther(withdrawable)}.`)
          throw new Error('withdraw amount > withdrawable')
        }

        if (!signer) await dispatch('connect')
        const contractSigner = contract.connect(signer)
        // go!
        const tx = await contractSigner.withdraw(tokenId, amountWei)
        return tx
      } catch (e) {
        console.error('@nftTopUp', e)
        throw e
      }
    },

    async getNFTMetadata (_, { projectAddress, tokenId }) {
      try {
        const contract = getProjectContract(projectAddress)
        const hash = await contract.tokenURI(tokenId)
        const meta = await fetch(hash)
        return await meta.json()
      } catch (e) {
        console.error('@getNFTMetadata', e)
      }
    },

    async addDripToProject ({ dispatch }, { projectAddress, dripFraction, receiverWeights }) {
      if (!signer) await dispatch('connect')
      const contract = getProjectContract(projectAddress)
      const contractSigner = contract.connect(signer)
      return contractSigner.drip(dripFraction, receiverWeights) // tx
    },

    async getSplitsReceivers ({ state, dispatch }, address) {
      try {
        if (!provider) await dispatch('init')
        
        let splits = []
        let raw = []

        const contract = getHubContract()
        // fetch events...
        let events = await contract.queryFilter('SplitsUpdated')
        // filter by the address
        events = events.filter(event => event.args[0].toLowerCase() === address.toLowerCase())  

        // has splits?
        if (events?.length) {
          const currentReceivers = events.pop().args[1]
          raw = currentReceivers

          // reformat...
          splits = currentReceivers.map(item => {
            const address = item[0].toLowerCase()
            const weight = item[1] // .toNumber()
            let percent = weight / state.splitsFractionMax * 100
            percent = Number(percent.toFixed(3))
            return {
              address,
              percent
            }
          })

          // sort by percent descending
          splits = splits.sort((a, b) => a.percent > b.percent ? -1 : a.percent < b.percent ? 1 : 0)
        }

        return { percents: splits, weights: raw }
      } catch (e) {
        console.error(e)
        return { percents: [], weights: [] }
      }
    },

    async updateAddressSplits (_, { currentReceivers, newReceivers }) {
      try {
        // validate...
        newReceivers = await validateSplits(newReceivers, provider)

        const contract = getHubContract()
        const contractSigner = contract.connect(signer)
        // tx...
        console.log('update splits:', { currentReceivers, newReceivers })
        return contractSigner.setSplits(currentReceivers, newReceivers)  
      } catch (e) {
        console.error(e)
        throw e
      }
    },

    // getSplitsReceivers (_, address) {
    //   const contract = getHubContract()
    //   return contract.getReceiversHash(address)
    // },

    getProjectDripFraction (_, projectAddress) {
      const contract = getHubContract()
      return contract.getDripsFraction(projectAddress)
    },

    getNFTActiveUntil (_, { projectAddress, tokenId }) {
      const contract = getProjectContract(projectAddress)
      return contract.activeUntil(tokenId)
    },

    getNFTWithdrawable (_, { projectAddress, tokenId }) {
      const contract = getProjectContract(projectAddress)
      return contract.withdrawable(tokenId)
    },

    async resolveAddress ({ state, getters, commit, dispatch }, { address  }) {
      try {
        // saved?
        const saved = state.addresses[address]
        if (saved !== undefined) {
          return saved
        }
        // fetch new...
        if (!provider) await dispatch('init')
        const ens = await provider.lookupAddress(address)
        // save even if null so we don't have to lookup again
        commit('SAVE_ADDRESS', { address, ens })
        return ens
      } catch (e) {
        console.error(e)
        return fallback
      }
    },

    async resolveENS ({ state, commit, dispatch }, ens) {
      try {
        // saved ?
        let address = Object.keys(state.addresses).find(key => state.addresses[key] === ens)
        if (address) return address
        // resolve...
        if (!provider) await dispatch('init')
        address = await provider.resolveName(ens)
        if (address) {
          // save if resolved...
          commit('SAVE_ADDRESS', { address, ens })
        }
        return address
      } catch (e) {
        console.error(e)
        return null
      }
    },

    updateProjectMeta (_, { address, ipfsHash }) {
      const contract = getProjectContract(address)
      const contractSigner = contract.connect(signer)
      return contractSigner.changeContractURI(ipfsHash)
    }
  }
})

// helpers

function getRadicleRegistryContract () {
  return new Ethers.Contract(RadicleRegistry.address, RadicleRegistry.abi, provider)
}

function getProjectContract (address) {
  return new Ethers.Contract(address, DripsToken.abi, provider)
}

function getDAIContract () {
  return new Ethers.Contract(DAI.address, DAI.abi, provider)
}

function getHubContract () {
  return new Ethers.Contract(DaiDripsHub.address, DaiDripsHub.abi, provider)
}

function newProject ({ name, symbol, owner, ipfsHash, inputNFTTypes, drips }) {
  let contract = getRadicleRegistryContract()
  contract = contract.connect(signer)
  console.log('new project...', arguments)
  return contract.newProject(name, symbol, owner, ipfsHash, inputNFTTypes, drips)
}

export async function pinJSONToIPFS (json) {
  let resp = await fetch('/.netlify/functions/pin', {
    method: 'POST',
    body: JSON.stringify(json)
  })
  resp = await resp.json()
  return resp.IpfsHash
}

export function pinImageToIPFS (imgString) {
  return fetch('/.netlify/functions/pinImage', {
    method: 'POST',
    body: JSON.stringify(imgString)
  })
}
