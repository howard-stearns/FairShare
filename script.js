/*
  TODO:
  - persist groups
*/

// This file is a mess. The idea was to just use straight Javascript + CSS + HTML, without any property-tracking framework,
// so that no specialized knowledge would be needed to see what is going on.
// But it turns out that the UI for exposition is oriented towards "what if" scenarios, so it would have been cleaner and more robust
// to use a dependency-tracking framework.

import {User as userBinding, Group as groupBinding, UnknownUser, InsufficientFunds, InsufficientReserves, NonPositive, NonWhole} from './domain.js';
import {ApplicationState} from './application.js';

// The following are not strictly necessary as they are defined globally, but making it explicit is more robust and aids developer tools.
var {URL, URLSearchParams, localStorage, addEventListener} = window; // Defined by Javascript.
var {componentHandler, QRCodeStyling} = window;    // Defined by Material Design Lite and qr code libraries.
var {subtitle, groupFilter, userButton, payee, groupsList,
     payCurrency, paySource2, payCurrency2, payCurrency3, payCost, payBalance, payFee, exchangeInput, exchangeFee,
     paymeCurrency, currency, currencyExchanged, investmentPool, payAmount, paySource, payExchanged, rate,
     poolCoin, poolReserve, portionCoin, portionReserve, balanceCoin, balanceReserve, investCoin, investReserve, afterCoin, afterReserve, investButton, afterPortionReserve, afterPortionCoin,
     fromCost, fromBefore, fromAfter, payButton, snackbar, bridgeCost, qrDisplay, paymeURL,
     errorTitle, errorMessage, errorDialog,
     groupTemplate, groupMemberTemplate, paymentTemplate} = window; // Defined by index.html elements with id= attribute.

// Expose to browser console for debugging. Alas, we need to rename them on import so that they can be exported correctly.
export const Group = groupBinding, User = userBinding;

class App extends ApplicationState {
  // These are called when their key's value is changed, and are used to set things up to match the change.
  section(state) {
    subtitle.textContent = state;
    if (state === 'invest' && this.getState('group') === 'fairshare') setTimeout(() => this.merge({group: ''}));
  }
  group(state) {
    let name = Group.get(state)?.name || 'pick one';
    paymeCurrency.textContent = paySource.textContent = paySource2.textContent = investmentPool.textContent = name;
    // Note that WE are asking OTHERS to pay us in our currently chosen group. Compare paying others in their currency.
    updateQRDisplay({payee: this.pending.user || this.states.user, currency: state, imageURL: userButton.querySelector('img').src});
    if (state) document.getElementById(state).scrollIntoView();
    this.setPayment();
    this.setInvestment();    
  }
  groupFilter(state) { // Set the toggle.
    if (groupFilter.checked === !!state) return;
    groupFilter.click();
  }
  user(state) {  // Set the images, switch user options, and qr code.
    const {name, img} = User.get(state),
	  picture = `images/${img}`;
    userButton.querySelector('img').src = picture;
    updateQRDisplay({payee: state, currency: this.pending.currency || this.states.currency, imageURL: picture});
    document.querySelectorAll('.mdl-menu > [data-key]').forEach(e => e.removeAttribute('disabled'));  // All enabled...
    document.querySelector(`.mdl-menu > [data-key="${state}"]`).setAttribute('disabled', 'disabled'); // ... except yourself.
    Group.list.forEach(key => updateGroupDisplay(key));
    // Payment menus should just list groups to which we belong.
    document.querySelector('ul[data-mdl-for="paymentButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="paySourceButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="currencyButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="investmentPoolButton"]').innerHTML = '';
    for (const groupElement of groupsList.children) {
      const key = groupElement.id,
	    group = Group.get(key),
	    userGroupData = group?.userData(state),
	    checkbox = groupElement.querySelector('expanding-li label.mdl-checkbox');
      if (!group) continue; // e.g., a template
      componentHandler.upgradeElement(checkbox); // Otherwise no MaterialCheckbox. (A quirk of Material Design Lite.)
      checkbox.MaterialCheckbox[userGroupData ? 'check' : 'uncheck']();
      if (!userGroupData) continue;
      updateGroupBalance(groupElement, userGroupData?.balance);
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="paymentButton"]');        // payme currency
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="paySourceButton"]');   // pay from
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="currencyButton"]');       // pay to
      if (key !== 'fairshare') { // Cannot exchange from fairshare pool yet
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="investmentPoolButton"]'); // investment exchange
      }
    }
    checkCurrency();
  }
  payee(state) { // Set the text.
    payee.textContent = User.get(state).name;
    if (checkCurrency()) this.setPayment();
  }
  currency(state) { // The target group for a payment to someone else.
    const {name} = Group.get(state).name;
    payCurrency.textContent = payCurrency2.textContent = payCurrency3.textContent = Group.get(state).name;
    //currencyExchanged.textContent = currency.textContent = Group.get(state).name; // fixme restore
    if (checkCurrency()) this.setPayment();
  }
  amount(state) {
    payAmount.value = state;
    this.setPayment();
  }
  investment(state){
    investReserve.value = state;
    this.setInvestment();
  }

  setPayment() { // Set up whatever can be set up about payment display.
    setTimeout(() => this.pay(false)); // Delay because this can be called during merge when states are not yet set to their new values.
  }
  setInvestment() { // Set up whatever can be set up about investment display.
    setTimeout(() => this.invest(false));
  }
    
  payPeople(execute) {
    const amounts = {},
	  {user, group} = LocalState.states,
	  element = document.getElementById(group),
	  via = Group.get(group);
    if (!via || !element) return;
    let total = 0;
    for (const input of element.querySelectorAll('.people input[type="number"]')) {
      if (input.value === '0') input.value = '';
      if (input.value) {
	total += (amounts[input.dataset.key] = parseFloat(input.value));
      }
    }
    function setCosts({cost = 0, balance} = {}, error = null) {
      element.querySelector('.cost').textContent = -cost;
      element.querySelector('.balanceAfter').textContent = balance;
      document.body.classList.toggle('payPeople', !error && cost);
    }
    if (!total) {
      setCosts();
      return;
    }
    try {
      setCosts(via.send(user, amounts, execute));
      if (!execute) return;
      document.body.classList.toggle('payPeople', false);
      snackbar.MaterialSnackbar.showSnackbar({message: `Paid ${total} ${via.name} to ${Object.keys(amounts).map(key => User.get(key).name).join(', ')}.`});
    } catch (error) {
      setCosts(error, error);
      this.displayError(error);
    }
  }
  pay(execute) {
    let {amount, payee, currency, user, group} = this.getStates();
    amount = this.asNumber(amount);
    function setCosts(data = {}, error = null) {
      const {cost, balance, redeemed = 0, certificateAmount} = data;
      console.log({amount, data, error});
      document.body.classList.toggle('redeemed', !!redeemed);
      document.body.classList.toggle('exchanged', !!certificateAmount);
      payCost.textContent = cost;
      if (certificateAmount) {
	if (redeemed) {
	  exchangeFee.textContent = (certificateAmount - cost).toLocaleString();
	  exchangeInput.textContent = certificateAmount.toLocaleString();
	  payExchanged.textContent = redeemed.toLocaleString();
	  rate.textContent = (redeemed/certificateAmount).toFixed(2);
	  payFee.textContent = (amount - redeemed).toLocaleString();
	} else {
	  exchangeFee.textContent = '';
	  exchangeInput.textContent = '';
	  payExchanged.textContent = certificateAmount.toLocaleString();
	  rate.textContent = (cost/certificateAmount).toFixed(2);
	  payFee.textContent = (amount - certificateAmount).toLocaleString();
	}
      } else {
	exchangeFee.textContent = exchangeInput.textContent = payExchanged.textContent = rate.textContent = ''; // fixme. Hide
	payFee.textContent = amount.toLocaleString();
      }
      payButton.toggleAttribute('disabled', !amount || error);
      if (!cost) return;
      payBalance.textContent = (payee === user && currency === group) ?  // Paying yourself within a group.
	`${(balance + cost - amount).toLocaleString()} - ${cost.toLocaleString()} + ${amount} = ${balance.toLocaleString()}` :
	`${(balance + cost).toLocaleString()} - ${cost.toLocaleString()} = ${balance.toLocaleString()}`;
    }
    if (!(amount && payee && currency && user && group && currency)) {
      setCosts();
      return;
    }
    try {
      setCosts(super.pay(execute));
      updateGroupDisplay(group);
      if (payee === user) updateGroupDisplay(currency);
      if (execute) snackbar.MaterialSnackbar.showSnackbar({message: `Paid ${amount} ${Group.get(currency).name} to ${User.get(payee).name}.`});
    } catch (error) {
      console.error(error);
      this.displayError(error);
      let {cost, balance} = error;
      error.balance -= cost;
      setCosts(error, error);
    }
  }
  invest(execute) {
    let {investment, group, user} = this.states;
    function setCosts({
      fromAmount = '', fromCost = '', fromBalance = '',
      toAmount = '', toCost = '', toBalance = '',
      totalGroupCoinReserve = '', totalReserveCurrencyReserve = '',
      portionGroupCoinReserve = '', portionReserveCurrencyReserve = ''
    } = {}) {
      poolCoin.textContent = totalGroupCoinReserve.toLocaleString();
      poolReserve.textContent = totalReserveCurrencyReserve.toLocaleString();
      portionCoin.textContent = portionGroupCoinReserve.toLocaleString();
      portionReserve.textContent = portionReserveCurrencyReserve.toLocaleString(),
      balanceCoin.textContent = (toBalance + toCost).toLocaleString();
      balanceReserve.textContent = (fromBalance + fromCost).toLocaleString();
      investCoin.textContent = toAmount.toLocaleString();
      afterPortionReserve.textContent = (portionReserveCurrencyReserve + fromAmount).toLocaleString();
      afterPortionCoin.textContent = (portionGroupCoinReserve + toAmount).toLocaleString();
      afterCoin.textContent = toCost ? toBalance.toLocaleString() : '';
      afterReserve.textContent = fromBalance.toLocaleString();
      investButton.toggleAttribute('disabled', !toCost);
    }
    if (!group) {
      setCosts();
      return;
    }
    investment = this.asNumber(investment);
    if (!investment) {
      const {balance:toBalance, ...exchangeData} = Group.get(group).userData(user);
      const {balance:fromBalance} = Group.get('fairshare').userData(user);
      setCosts({fromBalance, toBalance, ...exchangeData});
      return;
    }
    try {
      const data = super.invest(execute);
      if (execute) snackbar.MaterialSnackbar.showSnackbar({message: `${investment > 0 ? 'Invested in ' : 'Withdrawn from'} FairShare.`});
      setCosts(data);
      if (execute) investButton.toggleAttribute('disabled', true); // Disable until they update something.
    } catch (error) {
      if (error instanceof InsufficientReserves) {
	const {inputAmount, outputAmount, reserve, reserveCurrency} = error;
	if (reserveCurrency) setCosts({fromCost: outputAmount, portionReserveCurrencyReserve: reserve});
	else setCosts({toCost: outputAmount, portionGroupCoinRserve: reserve});
      } else if (error instanceof InsufficientFunds) {
	const {cost, balance, name} = error;
	if (name === 'FairShare') setCosts({fromCost:cost, fromBalance:balance});
	else setCosts({toCost:cost, toBalance:balance});
      }
      displayError(this.errorMessage(error));
    }
  }

  // Internal app machinery:

  // Each html section is styled as display:none by default, but have more specific css that turns a section on
  // if the body has a css class that matches that section. By adding one such section class at a
  // time to the body, we can make exactly one section visible without modifying the dom. (This is much more
  // efficient than re-generating each section all the time.) Similarly for the other keys other than section.
  stateChanged(key, old, state) {
      if (!this.unstyled.includes(key)) {
      const classList = document.body.classList;
      if (old) classList.remove(old); // Subtle: can remove('nonexistent'), but remove('') is an error.
      if (state) classList.add(state);
    }
    this.updateURL(key, state); // Make the internal url reflect state. Used by save().
  }
  // These two are tracked, but we do not add/remove classes for their values (which are from the same set as user & group).
  unstyled = [ 'payee', 'currency', 'amount', 'investment' ];

  // Local application state is saved, um, locally.
  save() { // Persist for next session, and update browser history, too.
    const string = JSON.stringify(this.states),
	  href = this.url.href;
    localStorage.setItem('localState', string);
    if (href !== location.href) history.pushState(this.states, document.title, href);
  }
  retrieve() { // Get saved state.
    let string = localStorage.getItem('localState');
    return string ? JSON.parse(string) : {user: 'alice'};
  }
  // The forward/back buttons and the browser history all work, getting you back to a local app state.
  // Of course, this does NOT undo transactions: it just gets you back to that screen, but with current shared group/user data.
  get url() { // Maintain a url matching location.href
    return this._url ||= new URL(location.href);
  }
  updateURL(key, value) { // Set the parameter or fragment in the url, to reflect key/value.
    if (key === 'section') { 
      this.url.hash = value;  // Sections appear in the hash of the url.
    } else {
      this.url.searchParams.set(key, value); // Everything else in the query parameters.
    }
  }
  displayError(error) {
    displayError(this.errorMessage(error));
  }
  errorMessage(error) {
    if (error instanceof InsufficientReserves) { // Must be before InsufficientFunds because it is a subtype
      const {inputAmount, outputAmount, outputReserve, reserveCurrency} = error;
      return `You need ${outputAmount} ${reserveCurrency ? 'reserve currency' : 'group coin'}, but the exchange pool has only ${outputReserve}.`;
    }
    if (error instanceof InsufficientFunds) {
      const {cost, balance, groupName} = error;
      return `You need ${cost} ${groupName}, but you only have ${balance}.`;
    }
    if (error instanceof UnknownUser) return `User "${User.get(error.user)?.name || error.user}" is not a member of ${error.groupName}.`;
    if (error instanceof NonPositive) return `${error.amount} is not a positive number.`;
    if (error instanceof NonWhole) return `${error.amount} is not a whole number.`;
    return error.message;
  }
}
const LocalState = new App();

function updateQRDisplay({payee, currency, imageURL}) { // Update payme qr code url+picture.
  const params = new URLSearchParams();
  params.set('payee', payee); // There is always a payee.
  if (currency) params.set('currency', currency); // But now always a specified currency.
  const query = params.toString();
  const url = new URL('?' + query, location.href); // URLSearchParams.toString() does not include the '?'
  url.hash = 'payme';
  const qrCode = new QRCodeStyling({
    width: 300,
    height: 300,
    type: "svg",
    data: url.href,
    image: imageURL,
    dotsOptions: {
      color: "#4267b2",
      type: "rounded"
    },
    backgroundOptions: {
      color: "#e9ebee",
    },
    imageOptions: {
      imageSize: 0.3,
      margin: 6
    }
  });
  qrDisplay.innerHTML = '';
  qrCode.append(qrDisplay);
  paymeURL.textContent = url;
}

function displayError(message, title = 'Error') { // Show an error dialog to the user.
  console.error(`${title}: ${message}`);
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorDialog.showModal();
}

function updateGroupBalance(groupElement, balance = '') { // 0 is '0', but undefined becomes ''.
  for (const element of groupElement.querySelectorAll('.balance')) element.textContent = balance;
}

function updateGroupDisplay(key, groupElement = document.getElementById(key)) {
  if (!key) return;
  const group = Group.get(key),
	{name, img} = group,
	user = LocalState.getState('user'),
	userGroupData = group.userData(user);
  groupElement.querySelector('expanding-li .mdl-list__item-avatar').setAttribute('src', `images/${img}`);
  groupElement.querySelector('expanding-li .group-name').textContent = name;
  if (!userGroupData) return;
  const {fee, stipend, balance, members} = userGroupData;
  updateGroupBalance(groupElement, balance);
  groupElement.querySelector('.fee').textContent = fee;  
  groupElement.querySelector('.stipend').textContent = stipend;  
  const peopleList = groupElement.querySelector('.people');
  peopleList.innerHTML = '';
  for (const {key:personKey, isCandidate} of members) {
    const personElement = groupMemberTemplate.content.cloneNode(true);
    const user = User.get(personKey);
    const buttonKey = 'pay'+ personKey;
    const input = personElement.querySelector('input');
    input.dataset.key = personKey;
    input.id = buttonKey;
    input.nextElementSibling.setAttribute('for', buttonKey);
    componentHandler.upgradeElement(input.parentElement);
    personElement.querySelector('.membership-action-label').textContent = isCandidate ? 'endorse' : 'expel';
    const label = personElement.querySelector('.name');
    label.textContent = user.name;
    label.parentElement.dataset.key = personKey;
    peopleList.append(personElement);
  }  
}

function makeGroupDisplay(key) { // Render the data for a group and it's members.
  const groupElement = groupTemplate.content.cloneNode(true).querySelector('li');
  groupElement.setAttribute('id', key);
  groupsList.append(groupElement);
}

function fillCurrencyMenu(key, name, listSelector) { // Add key/name group to menu list named by listSelector
  const currencyChoice = paymentTemplate.content.cloneNode(true).firstElementChild;
  currencyChoice.dataset.key = key;
  currencyChoice.textContent = name;
  document.querySelector(listSelector).append(currencyChoice);
}

function checkCurrency() { // Update payment currency for change of payee or currency. Answers whether current currency works.
  // We can only pay to currencies that the user and the payee are both in.
  // (I.e., if we are not a member then we can only pay them in FairShare and let the payee sort it out.)
  const currency = LocalState.getState('currency'), // We don't have all three set during the merge. getState checks pending states.
	payee = LocalState.getState('payee'),
	user = LocalState.getState('user');
  if (!(payee && user)) return false;
  let ok = false;
  for (const element of document.querySelector('[data-mdl-for="currencyButton"]').children) {
    const key = element.dataset.key,
	  group = Group.get(key),
	  bothMembers = group.isMember(payee, user);
    element.toggleAttribute('disabled', !bothMembers);
    if (key !== currency) continue;
    if (bothMembers) ok = true;
    else displayError(group.isMember(user) ?
		      `${User.get(payee).name} is not a member of ${group.name}.` :
		      `You are not a member of ${group.name}.`);
  }
  return ok;
}
  

// These onclick handlers are wired in index.html. They are exported so that index.html can reference them.

export function updatePaymentCosts() { // Update display
  LocalState.merge({amount: payAmount.value});
}
export function updateInvestmentCosts() { // Update display
  LocalState.merge({investment: investReserve.value});
}
export function updatePayPeople() {
  LocalState.payPeople(false);
}
export function pay() { // Actually pay someone (or display error)
  LocalState.pay(true);
  updateGroupDisplay(LocalState.states.group);
}
export function invest() { // Acutally invest or withdraw from exchange (or display error)
  LocalState.invest(true);
  updateGroupDisplay(LocalState.states.group);
  updateGroupDisplay('fairshare');
}
export function payPeople() {
  LocalState.payPeople(true);
  updateGroupDisplay(LocalState.states.group);  
}

export function toggleGroup(event) { // Open accordian for group, and make that one current.
  let item = event.target;
  while (!item.hasAttribute('id')) item = item.parentElement;
  const buttonGroupKey = item.getAttribute('id'),
	currentGroupKey = LocalState.states.group;
  if (!buttonGroupKey) return;
  if (buttonGroupKey !== currentGroupKey) return LocalState.merge({group: buttonGroupKey}); // Switch groups.
  // Otherwise, we're toggling the display on the current group.
  document.body.classList.toggle(buttonGroupKey);
}
export function chooseGroup(event) { // For someone to pay you. Becomes default group.
  LocalState.merge({group: event.target.dataset.key});
  updatePaymentCosts();
  updateInvestmentCosts();
}
export function chooseCurrency(event) { // What the payment is priced in
  LocalState.merge({currency: event.target.dataset.key});
  updatePaymentCosts();
}
export function changeAmount() {
  updatePaymentCosts();
  updateInvestmentCosts();
}
export  function userMenu(event) { // Act on user's choice in the user context menu.
  const state = event.target.dataset.key;
  if (['payme', 'profile', 'addUserKey', 'newUser'].includes(state)) return location.hash = state;
  LocalState.merge({user: state, group: ''});
}
export function choosePayee(event) { // Pick someone to pay.
  LocalState.merge({payee: event.target.dataset.key});
}
export function toggleDrawer() { // Close the drawer after navigating.
  document.querySelector('.mdl-layout').MaterialLayout.toggleDrawer();
}
export function filterGroups(event) {
  LocalState.merge({'groupFilter': event.target.checked ? 'allGroups' : ''});
}

function hashChange(event, {...props} = {}) { // A change to a different section.
  const section = location.hash.slice(1) || 'groups';
  if (section === 'reset') { // specal case
    setTimeout(() => {
      localStorage.clear();
      location.href = location.origin + location.pathname + '?';
    });
  }
  LocalState.merge({section, ...props}, true);
}

addEventListener('popstate', event => event.state && LocalState.merge(event.state, true));
addEventListener('hashchange', hashChange);
addEventListener('load', () => {
  Group.list.forEach(makeGroupDisplay);
  const params = {}; // Collect any params from query parameters.
  new URL(location).searchParams.forEach((state, key) => params[key] = state);
  hashChange(null, params);
});
