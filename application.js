// This file has the general "application" behavior of the FairShare app:
// - Behavior and state that is specific to what the current user is doing or prefers.
// - It is not shared with other users, and does not directly need any networking. It may persist locally across sessions.
// - Loosely corresponds to "Controller", "Presenter", or "ViewModel" in the "MVC", "MVP", and "MVVM" design patterns.
// - Compare with domain.js.

// There is only one instance - a singleton.
// (Other implementations work, too, but a resettable singleton is convenient for testing.)

// There is a test suite that illustrates the use of these, at spec/applicationSpec.js

class ApplicationState { // The specific implementation subclasses this.
  keys = [      // The various state names or dimensions that we track. Checks at runtime.
    'section', // The "page", "screen", or display we are on. In HTML, the standard is to divide the main element into sections.
    'user',    // The current user. One could have multiple "alts" or personas, even within the same group.
    'group',   // What group, if any, are we examining or paying/withdrawing from, or investing in (or last did so).

    'groupFilter', // Whether to show all, or just those that we are a member of.
    'payee',       // Who we are paying (or last paid). Only used in sending money.
    'currency',    // What are currency will the payee be paid in. Only used in sending money.
    'amount'       // How much will we send.
  ];

  merge(states, isChanged = false) { // Set all the specified states, update the display, and save if needed.
    const merged = Object.assign({}, this.retrieve(), this.states, states);
    this.pending = merged; // So that initializers can see the full set of other pending values.
    for (const key in merged) {
      const valueChanged = this.update1(key, merged[key]);
      isChanged ||= valueChanged;
    }
    this.states = merged; // After update1, and before save.
    if (isChanged) this.save();
  }
  getState(key) { // Return a single current state value by key.
    return this.states[key];
  }

  // Operations
  computePayment(amount) { // For paying group, answer: cost, balanceBefore, balanceAfter, and
    // additionally the recieving group exchange cost if the groups are different.
    const {user, payee, group, currency} = this.states;
    let fromAmount = 0, bridgeAmount;
    const target = Group.get(currency);
    const fromCurrency = Group.get(group);
    const fromBalance = fromCurrency?.people[user]?.balance;
    if (!amount || !group) return [0, fromBalance, fromBalance];
    if (group !== currency) {
      console.log('Source and target currencies do not match. Trading through FairShare group.');
      const bridgeCurrency = Group.get('fairshare');
      const bridgeBalance = bridgeCurrency.people[user]?.balance;
      bridgeAmount = target.exchange.computeBuyAmount(amount, target.exchange.totalReserveCurrencyReserve, target.exchange.totalGroupCoinReserve);
      if (bridgeAmount <= 0 || bridgeAmount >= bridgeCurrency.exchange.totalReserveCurrencyReserve) {
	throw new InsufficientReserves(`The ${target.name} exchange only has ${bridgeCurrency.exchange.totalReserveCurrencyReserve} FairShare.`);
      }
      if (group === 'fairshare') { // Draw the money directly from your account in the fairshare group.
	fromAmount = fromCurrency.computeTransferCost(bridgeAmount);
	console.log(`Will draw ${fromAmount} from FairShare to cover ${bridgeAmount}.`);
      } else { // Buy fairshare from your selected group's exchange.
	fromAmount = fromCurrency.exchange.computeBuyAmount(bridgeAmount, fromCurrency.exchange.totalGroupCoinReserve, fromCurrency.exchange.totalReserveCurrencyReserve);
	console.log(`Will buy ${bridgeAmount} FairShare with ${fromAmount} ${fromCurrency.name}.`);
	if (fromAmount <= 0 || fromAmount >= fromCurrency.exchange.totalReserveCurrencyReserve) {
	  throw new InsufficientReserves(`The ${fromCurrency.name} exchange only has ${fromCurrency.exchange.totalReserveCurrencyReserve} FairShare.`);
	}
      }
    } else {
      fromAmount = fromCurrency.computeTransferCost(amount);
    }
    let balanceAfter = fromBalance - fromAmount;
    if (balanceAfter < 0) throw new InsufficientFunds(`You only have ${fromBalance} ${fromCurrency.name}.`);
    return [fromAmount, fromBalance, balanceAfter, bridgeAmount];
  }
  pay(fromAmount, toAmount) {
    if (toAmount === undefined) return; // The user will already have been notificied of the problem.
    const {user, payee, group, currency} = this.states;
    const fromGroup = Group.get(group);
    if (group === currency) { // Payment within group, in one step.
      if (!fromGroup.send(toAmount, user, payee)) throw new InsufficientFunds(`Unable to make payment from ${fromGroup.name}.`);
    } else { // Issue a certificate for FairShare currency, and redeem it in the target group.
      const certificate = fromGroup.issueFairShareCertificate(fromAmount, user, payee);
      if (!certificate) throw new InsufficientFunds(`Unable to issue certficate from ${fromGroup.name}.`);

      // fixme: add to payee for him to redeem
      const toGroup = Group.get(currency);
      toAmount = toGroup.redeemFairShareCertificate(certificate); 
      if (!toAmount) throw new InsufficientReserves(`Unable to pay ${User.get(payee).name} in ${toGroup.name}`);
    }
  }

  // Internal machinery.
  states = {}; // Current/old values.
  update1(key, state) { // Set state as a class on the body element, after removing the class previously set for that key.
    if (!this.keys.includes(key)) throw new Error(`Unknown state '${key}', value '${state}'.`);
    const old = this.states[key];
    if (state === old) return false;
    this.stateChanged(key, old, state);
    this[key]?.(state); // Call initializer for key if it is defined here.
    return true;
  }

  // Object that inherit from this should override:
  stateChanged(key, oldState, newState) { throw new Error("Failed to define stateChange."); }
  save() { throw new Error("Failed to define save."); }
  retrieve() { throw new Error("Failed to define retrieve."); }    
};

// For unit testing in NodeJS.
if (typeof(module) !== 'undefined') {
  var {User, Group, UnknownUser, InsufficientFunds, InsufficientReserves} = require('./domain.js');
  module.exports = {ApplicationState};
}
