package main

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/rpc"
)

const URL = "http://localhost:8545"

type LogEntry struct {
	Data   PurchaseEvent `json:"data"`
	Topics []string      `json:"topics"`
}

type FilterQuery struct {
	FromBlock string   `json:"fromBlock"`
	ToBlock   string   `json:"toBlock"`
	Address   string   `json:"address"`
	Topics    []string `json:"topics"`
}

type PurchaseEvent struct {
	EthAmount   *big.Int
	TokenAmount *big.Int
}

func (p *PurchaseEvent) UnmarshalJSON(data []byte) error {
	event := new(PurchaseEvent)
	event.EthAmount = new(big.Int)
	event.TokenAmount = new(big.Int)
	event.EthAmount.SetString(string(data[2:66]), 16)
	event.TokenAmount.SetString(string(data[66:130]), 16)

	p = event

	return nil
}

func main() {
	client, err := rpc.Dial("ws://127.0.0.1:8545")
	if err != nil {
		fmt.Println("RPC connection failed")
	}
	// fetch current block
	// if currentBlock nil in redis or currentBlock < fetchedBlock
	// fetch all purchases since currentBlock + 1
	// save current block to redis
	// process all purchases and build balance table
	// subscribe to new log entries and blocks
	// start polling loop for ETH->BRL exchange rate
	// start websocket server
	subch := make(chan LogEntry)
	filterParams := FilterQuery{
		"0x39b710",
		"0x3ebcc5",
		"0x4870E705a3def9DDa6da7A953D1cd3CCEDD08573",
		[]string{
			"0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c"}}

	sub, err := client.EthSubscribe(
		context.Background(), subch, "logs", filterParams)

	if err != nil {
		fmt.Println("error")
		return
	}

	fmt.Println("connection lost: ", <-sub.Err())
}

func subscribeFilter(subch chan LogEntry) {

}

func getBalance() {

}

func getExchangeRate() {

}
