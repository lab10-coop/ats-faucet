// Ethereum currently doesn't allow contracts to pay for execution.
// As a workaround clients can call this script with an Ethereum address as parameter in order to get some funding.
// This workaround should become obsolete with a future version of Ethereum/ARTIS, see https://blog.ethereum.org/2016/03/05/serenity-poc2/ (Gas checking)

// example url: http://localhost:8678/addr/0x05125d60d2754e4d219cae2f2dcba46f73d415a2

var http = require('http')
var url = require('url')
var Web3 = require('web3')
const config = require('./config')

// globals
var web3 = null

// wrap the init stuff into async main in order to have await available
async function start() {
	if(isNaN(config.faucet.amount)) {
		console.error('ERR: no valid amount configured in "faucet.amount"');
		process.exit(1);
	}

	web3 = new Web3(new Web3.providers.HttpProvider(config.network.rpc));
	accs = await web3.eth.getAccounts();

	const listenIface = config.faucet.interface;
	const listenPort = config.faucet.port;
	http.createServer(handleRequest).listen(listenPort, listenIface);
	console.log(`http server listening at interface ${listenIface} port ${listenPort}`);
}

function handleRequest(req, res) {
	var pathname = url.parse(req.url).pathname;
	console.log(`request for ${pathname}`);

	res.setHeader('Access-Control-Allow-Origin', '*');

	// check if it's a path we care about
	var splitPath = url.parse(req.url).path.split('/');
	if(splitPath[1] == 'addr' && splitPath[2].startsWith('0x')) {
		var userAddr = splitPath[2];
		if(! web3.utils.isAddress(userAddr)) {
			res.writeHead(401, {'Content-Type': 'text/plain'});
			res.end("not a valid address");
			return;
		}
		console.log(`go serve ${userAddr}`);
		refuelAccount(userAddr, (err, txHash) => {
			if(err) {
				res.writeHead(500, {'Content-Type': 'text/plain'});
				res.end('Sorry, something went wront here');
			}
			if(txHash) {
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify({
					'txHash': txHash,
					'msg': 'Funds are on the way'
				}));
			}
		});
	} else {
		res.writeHead(401, {'Content-Type': 'text/plain'});
		res.end("I don't understand what you want");
	}
}

// helper function for printing balance of faucet and user account
async function printBalances(userAddr) {
	var faucetBalance = await web3.eth.getBalance(config.account.address);
	var userBalance = await web3.eth.getBalance(config.account.address);

	console.log(`balance of faucet account : ${web3.utils.fromWei(faucetBalance, 'ether')} ATS`);
	console.log(`balance of account ${userAddr} : ${web3.utils.fromWei(userBalance, 'ether')} ATS`);
}

// sends some ATS to the given account <userAddr>, invokes the given callback with the resulting transaction hash
// afterwards, waits for the tx to be processed (max 60 seconds). This is only for logging. The requesting client needs to check by itself
async function refuelAccount(userAddr, callback) {
	console.log(`sending ${config.faucet.amount} ATS to ${userAddr}...`);

	const txObj = {
		from: config.account.address,
		to: userAddr,
		value: web3.utils.toWei(config.faucet.amount.toString()),
		gas: 40000
	};
	const signedTxObj = await web3.eth.accounts.signTransaction(txObj, config.account.privateKey);
	txHash = (await web3.eth.sendSignedTransaction(signedTxObj.rawTransaction)).transactionHash;

	callback(null, txHash);

	console.log(`waiting for processing of transaction ${txHash}...`);
	waitForTxReceipt(userAddr, txHash);

	var loopCnt = 0;
	const maxWaitCnt = 60;
	function waitForTxReceipt(userAddr, txHash) {
		setTimeout(async () => {
			txReceipt = await web3.eth.getTransactionReceipt(txHash);
			if(txReceipt) {
				console.log(`\ntx processed in block ${txReceipt.blockNumber}`);
				// console.log(`\ntx processed: ${JSON.stringify(txReceipt, null, 4)}`);
				printBalances(userAddr);
			} else {
				if(loopCnt++ < maxWaitCnt) {
					process.stdout.write('.');
					waitForTxReceipt();
				} else {
					console.log(`\n### no tx receipt received after ${maxWaitCnt} seconds, giving up`);
				}
			}
		}, 1000);
	}
}

start();
