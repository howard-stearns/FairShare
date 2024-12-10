// This file has the general "domain" behavior of FairShare:
// - It models behavior of Users and Groups (including Exchnges).
// - These are the behaviors that would be shared over a network in a real app.
// - Corresponds to "model" in the "MVC", "MVP", and "MVVM" design patterns.
// - Compare with application.js.
//
// There is a test suite that illustrates the use of these, at spec/domsinSpec.js

// Internally, amounts are in whole numbers (with costs rounded up), and fees taken as a floating point number (e.g., 12% is 0.12)
function roundUpToNearest(number, unit = 1) { // Rounds up to nearest whole value of unit.
  return Math.ceil(number * unit) / unit;
}
function roundDownToNearest(number, unit = 1) { // Rounds up to nearest whole value of unit.
  return Math.floor(number * unit) / unit;
}

// Domain operations must do their own error checking, because:
// 1. It would be insecure to rely on callers to do it.
// 2. Here we know the particulars of what went wrong.
// So, we gather the particulars here rather than some generic invalid or coded return value.
class FairShareError extends Error {
  constructor({name, ...properties}) {
    // In some networking/replication models, domain operations must return the same values,
    // and so we cannot produce localized error message strings here.
    super(JSON.stringify(properties));
    if (!name) name = this.constructor.name; // Default Error.name isn't helpful, and cannot use 'this' before calling super.
    Object.assign(this, {name, ...properties});
  }
}
class UnknownUser extends FairShareError { }
class InsufficientFunds extends FairShareError { }
class InsufficientReserves extends InsufficientFunds { }
class ReusedCertificate extends FairShareError { }


// There are two subclasses: User and Group, below.
class SharedObject { // Stateful object that are replicated among all who have access.
  static create({name, key = this.name2key(name), ...properties}) { // Instantiate and record a subclass.
    return this.directory[key] = new this({name, ...properties}); // Each subclass must define it's own directory.
  }
  constructor(properties) {
    Object.assign(this, properties);
  }
  static get(key) { // Answer the identified subclass instance, as recorded by contstruct({key}).
    return this.directory[key];
  }
  static name2key(name) { // Default key given a name: lowercase concatenated.
    return name.toLowerCase().replace(/[_\s\-]/g, '');
  }
}


class User extends SharedObject { // Represent a User (globally, not specificaly within a single Group).
  static directory = {}; // Distinct from other SharedObjects.
  constructor(properties) {
    super(properties);
    this._pendingCerts = [];
    this._certIssues = 0;
    this._certsRedeemed = -1;
  }
  get nextCertificateNumber() {
    return this._certIssues++;
  }
  receiveCertificate(certificate) {
    this._pendingCerts.push(certificate);
  }
  consumeCertificate(certificate) {
    const {amount, number} = certificate;
    if (number <= this._certsRedeemed) throw new ReusedCertificate({certificate});
    this._certsRedeemed = number;
    return amount;
  }
}

class Group extends SharedObject { // Represent a group with currency, exchange, candidate and admitted members, etc.
  static directory = {}; // Distsinct from other SharedObjects.
  static get list() { // List all the Groups.
    return Object.keys(this.directory);
  }
  constructor({fee, totalGroupCoinReserve = 100e3, totalReserveCurrencyReserve = totalGroupCoinReserve, ...props}) {
    // fee here is a percent, rather than an number less than 1.
    const exchange = new Exchange({totalGroupCoinReserve, totalReserveCurrencyReserve, fee: fee/100});
    super({exchange, fee, ...props});
  }

  computeTransferCost(amount) { // Apply the group fee to answer the cost for transfering amount within the group.
    return roundUpToNearest(amount * (1 + this.fee/100));
  }
  computePurchaseCost(amount) { // How much FairShare is needed to exchange for amount of this group's currency.
    return this.exchange.computeBuyAmount(amount, this.exchange.totalReserveCurrencyReserve, this.exchange.totalGroupCoinReserve);
  }
  computeCertificateCost(amount) { // How much of this group's currency is needed to exchange for amount of FairShare.
    return this.exchange.computeBuyAmount(amount, this.exchange.totalGroupCoinReserve, this.exchange.totalReserveCurrencyReserve);
  }

  send(amount, user, payee, execute = false) {
    // Return {cost, balance}, where balance is what would remain for current user after sending.
    // If execute, atomically subtracts cost from user balance and adds amount to payee. (cost - amount) is removed from circulation.
    const cost = this.computeTransferCost(amount);

    const receiverData = this.people[payee];
    if (!receiverData) this.throwUnknownUser(payee);

    const balance = this.checkSenderBalance(cost, user, execute);
    if (execute) {
      receiverData.balance += amount;
    }
    return {cost, balance};
  }
  issueFairShareCertificate(amount, user, payee, currency, execute = false) {
    // Return {cost, balance), where balance is what would remain for current user after sending.
    // If execute, atomically subtracts cost from member balance and adds a cert for FairShares to payee.
    // (The cert will be redeemed by the user.)
    const fromFairShare = this === Group.get('fairshare');
    const cost = fromFairShare ?
	  this.computeTransferCost(amount) :                     // As for send.
	  this.computeCertificateCost(amount);                   // Different from send. (And don't adjust reserves yet, because we haven't finished tests.)

    const receiverData = User.get(payee);                        // General User object. We might not be a member of currency to get data there.
    if (!receiverData) this.throwUnknownUser(payee, 'any');

    const balance = this.checkSenderBalance(cost, user, execute); // As for send. Throws error if insufficient balance.
    if (execute) { // We have completed our tests and deducted from sender balance.
      if (!fromFairShare) {
	const cost2 = this.exchange.buyReserveCurrency(amount);
	if (cost2 !== cost) throw new FairShareError(`Actual cost ${cost2} does not match computed cost ${cost}. This should never happen.`);
      }
      const number = receiverData.nextCertificateNumber;
      receiverData.receiveCertificate({payee, amount, currency, number}); // Currency is advisory. See redeem...
    }
    return {cost, balance};                                      // As for send.
  }
  redeemFairShareCertificate(cert) { // Redeem cert, adding to balance (and reserves if appropriate). Error if bogus (including reused cert).
    const {payee} = cert;
    const user = User.get(payee);
    const payeeData = this.people[payee];
    if (!payeeData || !user) this.throwUnknownUser(payee);
    const amount = user.consumeCertificate(cert);
    const groupCoinCredit = (this === Group.get('fairshare')) ?
	  (amount - this.computeTransferCost(amount)) :
	  this.exchange.sellReserveCurrency(amount);
    payeeData.balance += groupCoinCredit;
    return groupCoinCredit;
  }

  checkSenderBalance(cost, user, execute) { // Return user's balance after subtracting cost, persisting it if execute, and throwing if insufficient or missing.
    const senderData = this.people[user];
    if (!senderData) this.throwUnknownUser(user);
    let {balance} = senderData;    
    if (balance < cost) this.throwInsufficientFunds(balance, cost);
    balance -= cost;
    if (execute) senderData.balance = balance;
    return balance;
  }
  throwUnknownUser(user, groupName = this.name) {
    throw new UnknownUser({user, groupName});
  }
  throwInsufficientFunds(balance, cost) {
    throw new InsufficientFunds({balance, cost, groupName: this.name});
  }
}

class Exchange { // Implements the math of Uniswap V1.
  constructor({totalGroupCoinReserve, totalReserveCurrencyReserve, fee = 0.003}) {
    Object.assign(this, {totalGroupCoinReserve, totalReserveCurrencyReserve, fee});
  }
  scale = 1;
  get scaledInverseFee() { return this.scale * (1 - this.fee); }
  computeSellAmount(inputAmount, inputReserve, outputReserve) { // To sell an inputAmount (of group or reserve currency), compute the amount of the other coin received.
    const numerator = inputAmount * outputReserve * this.scaledInverseFee;
    const denominator = inputReserve * this.scale + inputAmount * this.scaledInverseFee;
    const outputAmount = numerator / denominator;
    return roundDownToNearest(outputAmount, this.scale);
  }
  computeBuyAmount(outputAmount, inputReserve, outputReserve) { // To buy an outputAmount (of group or reserve currency), compute the cost in the other coin.
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
    return roundUpToNearest(inputAmount, this.scale);
  }
  reportTransaction({label, inputAmount, outputAmount, inputReserve, outputReserve, report=false}) {
    if (!report) return;
    const {totalReserveCurrencyReserve, totalGroupCoinReserve} = this;
    const fee = inputAmount * this.fee;
    const rate = outputAmount / inputAmount;
    const kBefore = inputReserve * outputReserve;
    const kAfter = totalReserveCurrencyReserve * totalGroupCoinReserve;
    console.log({label, inputAmount, outputAmount, fee, rate, inputReserve, outputReserve, totalReserveCurrencyReserve, totalGroupCoinReserve, kBefore, kAfter});
  }
  sellGroupCoin(amount) { // User sells amount of group currency to reserves, removing computed outputAmount of reserve currency from reserves.
    const inputAmount = amount;
    const inputReserve = this.totalGroupCoinReserve;
    const outputReserve = this.totalReserveCurrencyReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve += inputAmount;
    this.totalReserveCurrencyReserve -= outputAmount;
    this.reportTransaction({label: 'sellGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  sellReserveCurrency(amount) { // One can also sell the common trading coin (reserve currency) to the exchange.
    const inputAmount = amount;
    const inputReserve = this.totalReserveCurrencyReserve;
    const outputReserve = this.totalGroupCoinReserve;
    const outputAmount = this.computeSellAmount(inputAmount, inputReserve, outputReserve);
    this.totalGroupCoinReserve -= outputAmount;
    this.totalReserveCurrencyReserve += inputAmount;
    this.reportTransaction({label: 'sellPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});    
    return outputAmount;
  }
  buyGroupCoin(amount) { // User buys amount of group currency from exchange reserves, adding computed inputAmount of reserve currency to reserves.
    const outputAmount = amount;
    const outputReserve = this.totalGroupCoinReserve;
    const inputReserve = this.totalReserveCurrencyReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalReserveCurrencyReserve += inputAmount;
    this.totalGroupCoinReserve -= outputAmount;
    this.reportTransaction({label: 'buyGroupCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
  buyReserveCurrency(amount) { // One can also buy the common trading coin (reserve currency) from the exchange
    const outputAmount = amount;
    const outputReserve = this.totalReserveCurrencyReserve;
    const inputReserve = this.totalGroupCoinReserve;
    const inputAmount = this.computeBuyAmount(outputAmount, inputReserve, outputReserve);
    this.totalReserveCurrencyReserve -= outputAmount;
    this.totalGroupCoinReserve += inputAmount;
    this.reportTransaction({label: 'buyPricingCoin', inputAmount, outputAmount, inputReserve, outputReserve});
    return inputAmount;
  }
}

User.create({ name: "Alice", img: "alice.jpeg" });
User.create({ name: "Bob", img: "bob.png" });
User.create({ name: "Carol" });

Group.create({ name: "Apples", fee: 1, stipend: 1, img: "apples.jpeg", people: { alice: {balance: 100}, bob: {balance: 200} }});
Group.create({ name: "Bananas", fee: 2, stipend: 2, img: "bananas.jpeg", people: { bob: {balance: 300}, carol: {balance: 400} } });
Group.create({ name: "Coconuts", fee: 3, stipend: 3, img: "coconuts.jpeg", people: { carol: {balance: 500}, alice: {balance: 600} } });
Group.create({ name: "FairShare", fee: 2, stipend: 10, img: "fairshare.webp", people: { alice: {balance: 100}, bob: {balance: 100}, carol: {balance: 100} } });

// For unit testing in NodeJS.
if (typeof(module) !== 'undefined') module.exports = {roundUpToNearest, roundDownToNearest, User, Group, Exchange};
