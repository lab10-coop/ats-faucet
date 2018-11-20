var http = require('http')
var url = require('url')
var Web3 = require('web3')
const config = require('./config');

// globals
var web3 = null;

// wrap the init stuff into async main in order to have await available
async function start() {
  if(isNaN(config.amount)) {
    console.error('ERR: no valid amount configured in "faucet.amount"');
    process.exit(1);
  }

  web3 = new Web3(new Web3.providers.HttpProvider(config.network.rpc));

  http.createServer(handleRequest).listen(config.network.port, config.network.interface);
  console.log(`http server listening at interface ${config.network.interface} port ${config.network.port}`);
}

function handleRequest(req, res) {
  var pathname = url.parse(req.url).pathname;
  console.log(`request for ${pathname}`);

  res.setHeader('Access-Control-Allow-Origin', '*');

  // check if it's a path we care about
  var splitPath = url.parse(req.url).path.split('/');
  if(splitPath[1].startsWith('0x')) {
    var userAddr = splitPath[1];
    if(! web3.utils.isAddress(userAddr)) {
      res.writeHead(401, {'Content-Type': 'text/plain'});
      res.end(`not a valid address: ${userAddr}\n`);
      return;
    }

    console.log(`processing for ${userAddr}`);
    refuelAccount(userAddr, (err, txHash) => {
      // this is an ugly workaround needed because web3 may throw an error after giving us a txHash
      if(res.finished) return;

      if(err) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end(`${err}\n`);
      }
      if(txHash) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(`txHash: ${txHash}\n`);
      }
    });
  } else {
    res.writeHead(401, {'Content-Type': 'text/plain'});
    res.end('Illegal request. Check if the address starts with 0x');
  }
}

// sends some coins to the given account <userAddr>, invokes the given callback with the resulting transaction hash
async function refuelAccount(userAddr, callback) {
  console.log(`sending ${config.amount} ATS to ${userAddr}...`);

  const txObj = {
    from: config.account.address,
    to: userAddr,
    value: web3.utils.toWei(config.amount.toString()),
    gas: config.gas
  };
  const signedTxObj = await web3.eth.accounts.signTransaction(txObj, config.account.privateKey);

  web3.eth.sendSignedTransaction(signedTxObj.rawTransaction)
    .once('transactionHash', function (txHash) {
      console.log(`waiting for processing of token transfer transaction ${txHash}`);
      callback(null, txHash);
    })
    .once('receipt', function (receipt) {
      if (! receipt.status) {
        console.error(`transfer transaction ${receipt.transactionHash} failed`);
      } else {
        console.log(`transfer transaction ${receipt.transactionHash} executed in block ${receipt.blockNumber} consuming ${receipt.gasUsed} gas`);
      }
    })
    .on('error', function (err) {
      console.error(`transfer transaction failed: ${err}`);
      callback(err, null);
    });
}

start();
