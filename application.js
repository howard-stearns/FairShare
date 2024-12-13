// This file has the general "application" behavior of the FairShare app:
// - Behavior and state that is specific to what the current user is doing or prefers.
// - It is not shared with other users, and does not directly need any networking. It may persist locally across sessions.
// - Loosely corresponds to "Controller", "Presenter", or "ViewModel" in the "MVC", "MVP", and "MVVM" design patterns.
// - Compare with domain.js.

// There is only one instance - a singleton in the LocalState var of script.js
// (Other implementation would also work, but a resettable singleton is convenient for testing.)

// There is a test suite that illustrates the use of this, at spec/applicationSpec.js

import {User, Group, NonWhole, FairShareError} from './domain.js' ;

export class ApplicationState { // The specific implementation subclasses this.
  keys = [      // The various state names or dimensions that we track. Checks at runtime.
    'section', // The "page", "screen", or display we are on. In HTML, the standard is to divide the main element into sections.
    'user',    // The current user. One could have multiple "alts" or personas, even within the same group.
    'group',   // Which of the current user's groups is active: i.e., that we examining or paying/withdrawing from, or investing in (or last did so).

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
  asNumber(string) { // state values are strings
    return parseFloat(string || '0');
  }

  // Operations
  pay(execute) { // Pay, either directly or through an exchange. The latter generates a cert that the payee must redeem.
    let {user, payee, group, currency, amount} = this.states;
    amount = this.asNumber(amount);
    const fromGroup = Group.get(group);
    const toGroup = Group.get(currency);
    if (fromGroup === toGroup) return fromGroup.send(amount, user, payee, execute);
    if (amount % 1) throw new NonWhole({amount}); // Other errors will be triggered downstream, but computeMumble will round and suppress unless we check.
    const receivingCost = toGroup.isFairShare ? toGroup.computeTransferCost(amount) : toGroup.computePurchaseCost(amount),
	  {cost, balance} = fromGroup.issueFairShareCertificate(receivingCost, user, payee, currency, execute);
    return {cost, balance, certificateCost: receivingCost};
  }
  invest(execute) { // Invest or withdraw (if amount is negative).
    const {user, group, amount} = this.states;
    const from = Group.get('fairshare'); // Where the reserve currency comes from, via a cert.
    const to = Group.get(group);         // Where the exechange is, and where the group coin balance comes from.
    const fromAmount = this.asNumber(amount);
    const {amount:toAmount, cost:toCost} = to.computeInvestmentCost(fromAmount);
    const {balance:toBalance} = to.checkSenderBalance(toCost, user); // Make sure now, before we issue the cert.

    let {cost:fromCost, balance:fromBalance, certificate} = from.issueFairShareCertificate(fromAmount, user, user, 'fairshare', execute);
    const {cost:toCost2, balance:toBalance2, ...rest} = to.invest(certificate, execute);
    FairShareError.assert(toCost2, toCost, 'cost');
    FairShareError.assert(toBalance2, toBalance, 'balance');
    return {fromAmount, fromCost, fromBalance, toAmount, toCost, toBalance, ...rest};
  }
  redeemCertificates(user = this.states.user) { // Collect from any certificates that we may have received.
    let userData = User.get(user);
    if (!userData) return;
    while (userData._pendingCerts?.length) {
      const certificate = userData._pendingCerts[userData._pendingCerts.length - 1];
      Group.get(certificate.currency).redeemFairShareCertificate(certificate);
      // only if successful.
      userData._pendingCerts.pop();
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
    // Note that at time this[key](state) is called, state is known as an argument, which is fine for most purposes.
    // However this.states[key] is not yet set, and this makes things awkward when we want to do something that depends
    // on the final value of multiple keys. (E.g., see calls to setPayment().) Maybe we should have a more general
    // mechanism for this?
    return true;
  }

  // Object that inherit from this should override:
  stateChanged(key, oldState, newState) { throw new Error("Failed to define stateChange."); }
  save() { throw new Error("Failed to define save."); }
  retrieve() { throw new Error("Failed to define retrieve."); }    
};
