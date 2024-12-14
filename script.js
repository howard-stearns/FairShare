/*
  TODO:
  - stipend
  - vote
  - what happens when someone does payme for a group you are not in?
  - do something for invest/withdraw of fairshare group
  - simplify paying other groups/certs
*/

import {User as userBinding, Group as groupBinding, UnknownUser, InsufficientFunds, InsufficientReserves, NonPositive, NonWhole} from './domain.js';
import {ApplicationState} from './application.js';

// The following are not strictly necessary as they are defined globally, but making it explicit is more robust and aids developer tools.
var {URL, URLSearchParams, localStorage, addEventListener} = window; // Defined by Javascript.
var {componentHandler, QRCodeStyling} = window;    // Defined by Material Design Lite and qr code libraries.
var {subtitle, groupFilter, userButton, payee, groupsList,
     paymeCurrency, fromCurrency, currency, currencyExchanged, investmentPool, investmentCurrency, payAmount,
     poolCoin, poolReserve, portionCoin, portionReserve, balanceCoin, balanceReserve, investCoin, investReserve, afterCoin, afterReserve, investButton,
     fromCost, fromBefore, fromAfter, payButton, snackbar, bridgeCost, qrDisplay, paymeURL,
     errorTitle, errorMessage, errorDialog,
     groupTemplate, groupMemberTemplate, paymentTemplate} = window; // Defined by index.html elements with id= attribute.

// Expose to browser console for debugging. Alas, we need to rename them on import so that they can be exported correctly.
export const Group = groupBinding, User = userBinding;

class App extends ApplicationState {
  // These are called when their key's value is changed, and are used to set things up to match the change.
  section(state) {
    subtitle.textContent = state;
  }
  group(state) {
    let name = Group.get(state)?.name || 'pick one';
    paymeCurrency.textContent = fromCurrency.textContent = investmentCurrency.textContent = investmentPool.textContent = name;
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
    this.redeemCertificates(state); // FIXME: rationalize this.
    userButton.querySelector('img').src = picture;
    updateQRDisplay({payee: state, currency: this.pending.currency || this.states.currency, imageURL: picture});
    document.querySelectorAll('.mdl-menu > [data-key]').forEach(e => e.removeAttribute('disabled'));  // All enabled...
    document.querySelector(`.mdl-menu > [data-key="${state}"]`).setAttribute('disabled', 'disabled'); // ... except yourself.
    Group.list.forEach(key => updateGroupDisplay(key));
    // Payment menus should just list groups to which we belong.
    document.querySelector('ul[data-mdl-for="paymentButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="fromCurrencyButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="currencyButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="investmentPoolButton"]').innerHTML = '';
    for (const groupElement of groupsList.children) { // fixme: combine with update group display
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
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="fromCurrencyButton"]');   // pay from 
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="currencyButton"]');       // pay to
      if (key !== 'fairshare') { // Cannot exchange from fairshare pool yet
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="investmentPoolButton"]'); // investment exchange
      }
    }
  }
  payee(state) { // Set the text.
    payee.textContent = User.get(state).name;
    this.setPayment();
  }
  currency(state) { // The target group for a payment to someone else.
    const {name} = Group.get(state).name;
    currencyExchanged.textContent = currency.textContent = Group.get(state).name;
    this.setPayment();
  }
  amount(state) {
    if (this.asNumber(state) >= 0) payAmount.value = state;
    investReserve.value = state;
    this.setPayment();
    this.setInvestment();
  }

  setPayment() { // Set up whatever can be set up about payment display.
    setTimeout(() => this.pay(false)); // Delay because this can be called during merge when states are not yet set to their new values.
  }
  setInvestment() { // Set up whatever can be set up about investment display.
    setTimeout(() => this.invest(false));
  }
    
  pay(execute) {
    let {payee, amount, currency, group, user} = this.states;
    amount = this.asNumber(amount);
    const fromGroup = Group.get(group),
	  data = fromGroup?.userData(user);
    function setCosts(cost, balance) {
      fromCost.textContent = cost;
      fromAfter.textContent = balance;
      fromBefore.textContent = balance + cost;
    }
    if (!(amount && group && currency && user && payee)) {
      setCosts(0, data?.balance);
      payButton.disabled = true;
      document.body.classList.remove('payment-bridge');
      return;
    }
    try {
      const {cost, balance, certificateCost} = super.pay(execute);
      const currencyName = Group.get(currency).name;
      const payeeName = User.get(payee).name;
      setCosts(cost, balance);
      payButton.textContent = `Pay ${payeeName} ${amount} ${currencyName} using ${cost} ${fromGroup.name}`;
      payButton.disabled = execute; // Arbitrary design choice: Disable it on successful actual payment.
      bridgeCost.textContent = certificateCost;
      document.body.classList.toggle('payment-bridge', certificateCost !== undefined);
      if (execute) snackbar.MaterialSnackbar.showSnackbar({message: `Paid ${amount} ${currencyName} to ${payeeName}`});
    } catch (error) {
      let message = this.errorMessage(error); // Can only be localized to language here in the app.
      if (error instanceof InsufficientReserves) { // Must be before InsufficientFunds because it is a subtype
	const {inputAmount} = error;
	setCosts(inputAmount, data ? data.balance- inputAmount: '');
      } else if (error instanceof InsufficientFunds) {
	const {cost, balance} = error;
	setCosts(cost, balance);
      }
      payButton.disabled = true;
      document.body.classList.remove('payment-bridge'); // It would be nice if we had a cost to show.
      displayError(message, error.name);
    }
  }
  invest(execute) {
    let {amount, group, user} = this.states;
    function setCosts({
      fromAmount = '', fromCost = '', fromBalance = '',
      toAmount = '', toCost = '', toBalance = '',
      totalGroupCoinReserve = '', totalReserveCurrencyReserve = '',
      portionGroupCoinReserve = '', portionReserveCurrencyReserve = ''
    } = {}) {
      poolCoin.textContent = totalGroupCoinReserve;
      poolReserve.textContent = totalReserveCurrencyReserve;
      portionCoin.textContent = portionGroupCoinReserve;
      portionReserve.textContent = portionReserveCurrencyReserve,
      balanceCoin.textContent = fromBalance + fromCost;
      balanceReserve.textContent = toBalance + toCost;
      investCoin.textContent = toCost;
      afterCoin.textContent = toCost ? toBalance : '';
      afterReserve.textContent = fromCost ? fromBalance : '';
      if (toCost && fromCost) investButton.removeAttribute('disabled');
      else investButton.setAttribute('disabled', 'disabled');
    }
    if (!group) {
      setCosts();
      return;
    }
    if (!parseFloat(amount)) {
      const {balance:toBalance, ...exchangeData} = Group.get(group).userData(user);
      const {balance:fromBalance} = Group.get('fairshare').userData(user);
      setCosts({fromBalance, toBalance, ...exchangeData});
      return;
    }
    try {
      const data = super.invest(execute);
      setCosts(data);
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
  unstyled = [ 'payee', 'currency', 'amount' ];

  // Local application state is saved, um, locally.
  save() { // Persist for next session, and update browser history, too.
    const string = JSON.stringify(this.states),
	  href = this.url.href;
    localStorage.setItem('localState', string);
    if (href !== location.href) history.pushState(this.states, document.title, href);
  }
  retrieve() { // Get saved state.
    let string = localStorage.getItem('localState');
    return string ? JSON.parse(string) : {groupFilter: 'allGroups', user: 'alice'};
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
  errorMessage(error) {
    if (error instanceof InsufficientReserves) { // Must be before InsufficientFunds because it is a subtype
      const {inputAmount, outputAmount, outputReserve, reserveCurrency} = error;
      return `You need ${outputAmount} ${reserveCurrency ? 'reserve currency' : 'group coin'}, but the exchange pool has only ${outputReserve}.`;
    }
    if (error instanceof InsufficientFunds) {
      const {cost, balance, groupName} = error;
      return `You need ${cost} ${groupName}, but you only have ${balance}.`;
    }
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
  const feeRow = groupElement.querySelector('row:has(.fee)');
  const feeId = key + '-fee';
  feeRow.querySelector('input').setAttribute('id', feeId);
  feeRow.querySelector('label').setAttribute('for', feeId);
  const stipendRow = groupElement.querySelector('row:has(.stipend)');
  const stipendId = key + '-stipend';
  stipendRow.querySelector('input').setAttribute('id', stipendId);
  stipendRow.querySelector('label').setAttribute('for', stipendId);
  const peopleList = groupElement.querySelector('.people');
  peopleList.innerHTML = '';
  for (const {key:personKey, isCandidate} of members) {
    const personElement = groupMemberTemplate.content.cloneNode(true);
    const user = User.get(personKey);
    personElement.querySelector('.membership-action-label').textContent = isCandidate ? 'endorse' : 'expel';
    personElement.querySelector('row > span').textContent = user.name;
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


// These onclick handlers are wired in index.html. They are exported so that index.html can reference them.

export function updatePaymentCosts() { // Update display
  LocalState.merge({amount: payAmount.value});
}
export function updateInvestmentCosts() { // Update display
  LocalState.merge({amount: investReserve.value});
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
    localStorage.clear();
    location.href = location.origin + location.pathname + '?';
  }
  LocalState.merge({section, ...props}, true);
}

addEventListener('popstate', event => event.state && LocalState.merge(event.state, true));
addEventListener('hashchange', hashChange);
addEventListener('load', () => {
  Group.list.forEach(makeGroupDisplay);
  // A hack for our double-labeled switches.
  document.querySelectorAll('.switch-label').forEach(label => label.onclick = (e) => label.nextElementSibling.click(e));
  const params = {}; // Collect any params from query parameters.
  new URL(location).searchParams.forEach((state, key) => params[key] = state);
  hashChange(null, params);
});
