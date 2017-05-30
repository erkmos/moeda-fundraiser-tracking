package main

import (
	"github.com/ethereum/go-ethereum"
	"math/big"
)

const baseUrl = "http://localhost:8545"
var filterId

// "method":"eth_newFilter","params":[{"fromBlock": "0x39b710", "toBlock": "latest", "address": "0x4870E705a3def9DDa6da7A953D1cd3CCEDD08573", "topics": ["0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c"]}],"id":74}'
// returns id {"jsonrpc":"2.0","result":"0x1","id":74}
// {"jsonrpc":"2.0","method":"eth_getFilterLogs","params":["0x1"],"id":74}
// {"jsonrpc":"2.0","result":[Log, Log]}
// Log = {
//    "data" : "0x000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000de0b6b3a76400000",
//    "blockNumber" : "0x39be8a",
//    "blockHash" : "0x13c78cc9af138ecf3d9dc135a93cb07d905ea2383559ecf245b9af689fbbc119",
//    "address" : "0x4870e705a3def9dda6da7a953d1cd3ccedd08573",
//    "transactionIndex" : "0x4",
//    "transactionHash" : "0x11816e6f08d4ed62aa1d8bc97ec547b1428d2b952fa4ad683fcf33c7dcb49158",
//    "topics" : [
//       "0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c",
//       "0x00000000000000000000000055b30722d84ca292e4432f644f183d1986d2b8f9"
//    ],
//    "logIndex" : "0x3",
//    "type" : "mined",
//    "transactionLogIndex" : "0x1"
// },

type PurchaseEvent struct {
  EthAmount *big.Int
  TokenAmount *big.Int
}

type FilterParams struct {
  FromBlock string `json:"fromBlock"`
  ToBlock string `json:"toBlock"`
  Address string `json:"address"`
  Topics string[] `json:"topics"`
}

type FilterResult {
  data PurchaseEvent `json:"`
}

type RPCRequest struct {
	ID      string      `json:"id"`
	Version string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  []RPCParams `json:"params"`
}

type RPCResponse struct {
	ID      string        `json:"id"`
	Version string        `json:"jsonrpc"`
	Result  []interface{} `json:"result"`
}

func (p *PurchaseEvent) UnmarshalJSON(data byte[]) error {
  p = PurchaseEvent{string(data[0:64]), string(data[64:128])}
  return nil
}

func getLogs(contractAddress string) {
  params := FilterParams{
    "0x39b710",
    "latest",
    contractAddress,
    []string{
      "0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c"
    })
  }
  data, err := json.Marshal(params)
	if err != nil {
		// do something
	}
  makeRequest("eth_newFilter", data)
}

func makeRequest(contractAddress string, method string, params byte[]) {
	req := RPCRequest("1", "2.0", method, params)


	res, err := http.Post(baseUrl, "application/json", buffer.newBuffer(data))
	if err != nil {
		// do something
	}
	defer res.Body.Close()

}
