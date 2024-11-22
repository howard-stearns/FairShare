// Initial data and local storage setup
const users = {
    alice: { name: "Alice", description: "Lorem ipsum", balance: 0 },
    bob: { name: "Bob", description: "Lorem ipsum", balance: 0 },
    carol: { name: "Carol", description: "Lorem ipsum", balance: 0 },
};
const groups = [
    { name: "Apples", members: { Alice: 1, Bob: 2 }, description: "Lorem ipsum", img: "" },
    { name: "Bananas", members: { Bob: 3, Carol: 4 }, description: "Lorem ipsum", img: "" },
    { name: "Coconuts", members: { Carol: 5, Alice: 6 }, description: "Lorem ipsum", img: "" },
];
function getUser(name) { return users[name]; }
const currentUser = "Alice";


class Exchange {
  constructor({totalGroupCoinReserve, totalFairCoinReserve, fee=0.003}) {
    Object.assign(this, {totalGroupCoinReserve, totalFairCoinReserve, fee});
  }
  scale = 1000;
  get scaledInverseFee() { return this.scale * (1 - this.fee); }
  roundUpToNearest(number) { // Rounds up to nearest whole value of scale.
    let {scale} = this;
    return Math.ceil(number * scale) / scale;
  }
  computeSellAmount(inputAmount, inputReserve, outputReserve) { // To sell an inputAmount (og group or fair coin), compute the amount of the other coin received.
    const numerator = inputAmount * outputReserve * this.scaledInverseFee;
    const denominator = inputReserve * this.scale + inputAmount * this.scaledInverseFee;
    const outputAmount = numerator / denominator;
    return this.roundUpToNearest(outputAmount);
  }
  computeBuyAmount(outputAmount, inputReserve, outputReserve) { // To buy an outputAmount (of group or fair coin), compute the cost in the other coin.
    const numerator = outputAmount * inputReserve * this.scale;
    const denominator = (outputReserve - outputAmount) * this.scaledInverseFee;
    // Note: In Uniswap v1, the following forumula has an additional +1, i.e., numerator / denominator + 1.
    // See https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#amount-sold-buy-order
    // 1. That's not a constant k = x * y before and after the trade as advertized, and
    // 2. That's a buy order fee of input*0.003 + 1 instead of the advertized input*0.003.
    // It turns out that the +1 is trying to round up without costing too much "gas".
    // See https://www.reddit.com/r/UniSwap/comments/rjzkcj/why_does_it_have_add1_uniswapv2library_getamountin/
    // But, then, it's not clear to me why the formula in the spec for sell order outputAmount doesn't also have that:
    // https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#amount-bought-sell-order
    // (Note that some of the latter sections on the same page are still designated as "comming soon":
    //  https://github.com/Uniswap/docs/blob/main/docs/contracts/v1/guides/03-trade-tokens.md#eth--erc20-trades)
    const inputAmount = numerator / denominator; 
    return this.roundUpToNearest(inputAmount);
  }
  reportTransaction({label, inputAmount, outputAmount, inputReserve, outputReserve, report=false}) {
    if (!report) return;
    const {totalFairCoinReserve, totalGroupCoinReserve} = this;
    const fee = inputAmount * this.fee;
    const rate = outputAmount / inputAmount;
    const kBefore = inputReserve * outputReserve;
    const kAfter = totalFairCoinReserve * totalGroupCoinReserve;
    console.log({label, inputAmount, outputAmount, fee, rate, inputReserve, outputReserve, totalFairCoinReserve, totalGroupCoinReserve, kBefore, kAfter});
  }
  sellGroupCoin(amount) { // User sells amount of group currency to reserves, removing computed outputAmount of fairCoin from reserves.
    const inputAmount = amount;
    const inputReserve = this.totalGroupCoinReserve;
    const outputReserve = this.totalFairCoinReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve += inputAmount;
    this.totalFairCoinReserve -= outputAmount;
    this.reportTransaction({label: 'sellGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  sellFairCoin(amount) { // One can also sell the common trading coin (FairShare group) to the exchange.
    const inputAmount = amount;
    const inputReserve = this.totalFairCoinReserve;
    const outputReserve = this.totalGroupCoinReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve -= outputAmount;
    this.totalFairCoinReserve += inputAmount;
    this.reportTransaction({label: 'sellPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  buyGroupCoin(amount) { // User buys amount of group currency from exchange reserves, adding computed inputAmount of fairCoin to reserves.
    const outputAmount = amount;
    const outputReserve = this.totalGroupCoinReserve;
    const inputReserve = this.totalFairCoinReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalFairCoinReserve += inputAmount;
    this.totalGroupCoinReserve -= outputAmount;
    this.reportTransaction({label: 'buyGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
  buyFairCoin(amount) { // One can also buy the common trading coin (FairShare group) from the exchange
    const outputAmount = amount;
    const outputReserve = this.totalFairCoinReserve;
    const inputReserve = this.totalGroupCoinReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalFairCoinReserve -= outputAmount;
    this.totalGroupCoinReserve += inputAmount;
    this.reportTransaction({label: 'buyPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
}
function testGroupCoinTrades({totalFairCoinReserve = 100, totalGroupCoinReserve = 100, fee=0, nCycles=10}) {
  let exchange = new Exchange({totalFairCoinReserve, totalGroupCoinReserve, fee});
  for (let i=0; i<nCycles; i++) {
    exchange.buyGroupCoin(1);
    exchange.sellGroupCoin(1);
  }
  let kBefore = totalFairCoinReserve * totalGroupCoinReserve,
      kAfter = exchange.totalFairCoinReserve * exchange.totalGroupCoinReserve;
  console.log(fee, kBefore / kAfter);
}
function testFairCoinTrades({totalFairCoinReserve = 100, totalGroupCoinReserve = 100, fee=0, nCycles=10}) {
  let exchange = new Exchange({totalFairCoinReserve, totalGroupCoinReserve, fee});
  for (let i=0; i<nCycles; i++) {
    exchange.buyFairCoin(1);
    exchange.sellFairCoin(1);
  }
  let kBefore = totalFairCoinReserve * totalGroupCoinReserve,
      kAfter = exchange.totalFairCoinReserve * exchange.totalGroupCoinReserve;
  console.log(fee, kBefore / kAfter);
}
/*
testGroupCoinTrades({});
testGroupCoinTrades({totalGroupCoinReserve: 10000});
testGroupCoinTrades({fee: 0.003});
testGroupCoinTrades({totalGroupCoinReserve: 10000, fee: 0.003});

testFairCoinTrades({});
testFairCoinTrades({totalGroupCoinReserve: 10000});
testFairCoinTrades({fee: 0.003});
testFairCoinTrades({totalGroupCoinReserve: 10000, fee: 0.003});
*/
/*
const inputAmount = 1;
const inputReserve = 1;
const outputReserve = 1;
const scale = 1;
const feeRate = 0;
const numerator = inputAmount * outputReserve * scale;
const denominator = inputReserve * scale + inputAmount * scale * (1-feeRate);
const outputAmount = numerator / denominator;
const fee = inputAmount * feeRate;
const rate = outputAmount / inputAmount;
const nextOutputReserve = outputReserve - outputAmount;
const nextInputReserve = inputReserve + inputAmount;
const reserveRatio = nextOutputReserve / nextInputReserve;
console.log({numerator, denominator, outputAmount, fee, rate, nextInputReserve, nextOutputReserve, reserveRatio});
*/
