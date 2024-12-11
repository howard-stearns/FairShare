/*
  TODO:
  - Fix up certficate management.
  - be consistent about naming keys vs actual SharedObjects
  - show reserves in group display
  - stipend
  - widthraw
  - invest, including accounting data
  - vote
  - user menu
  - disable twist down a group you are not in
  - genericize (including dynamically addition of group-based css rule, populating users, and populating user menus appropriately)
*/

import {User, Group, UnknownUser, InsufficientFunds, InsufficientReserves} from './domain.js';
import {ApplicationState} from './application.js';

// The following are not strictly necessary as they are defined globally, but making it explicit is more robust and aids developer tools.
var {URL, URLSearchParams, localStorage, addEventListener} = window; // Defined by Javascript.
var {componentHandler, QRCodeStyling} = window;    // Defined by Material Design Lite and qr code libraries.
var {subtitle, paymeCurrency, fromCurrency, groupFilter, currentUserName, userButton, fixmeOtherUser,
     payee, groupsList, currency, currencyExchanged,
     fromCost, fromBefore, fromAfter, payButton, snackbar, bridgeCost, qrDisplay, paymeURL,
     errorTitle, errorMessage, errorDialog,
     groupTemplate, groupMemberTemplate, paymentTemplate} = window; // Defined by index.html elements with id= attribute.

const localPersonas = ['alice', 'bob']; // fixme?

class App extends ApplicationState {
  // These are called when their key's value is changed, and are used to set things up to match the change.
  section(state) {
    subtitle.textContent = state;
    if (state === 'pay') setTimeout(updatePaymentCosts);
  }
  group(state) {
    let name = Group.get(state)?.name || 'pick one';
    paymeCurrency.textContent = name;
    fromCurrency.textContent = name;
    // Note that WE are asking OTHERS to pay us in our currently chosen group. Compare paying others in their currency.
    updateQRDisplay({payee: this.pending.user || this.states.user, currency: state, imageURL: userButton.querySelector('img').src});
    if (state) document.getElementById(state).scrollIntoView();
    this.setPayment();
  }
  groupFilter(state) { // Set the toggle.
    if (groupFilter.checked === !!state) return;
    groupFilter.click();
  }
  user(state) {  // Set the images, switch user options, and qr code.
    const {name, img} = User.get(state),
	  picture = `images/${img}`,
	  fixmeOther = localPersonas[(localPersonas.indexOf(state)+1) % localPersonas.length];
    this.redeemCertificates(state); // TODO: handle failures
    currentUserName.textContent = name;
    userButton.querySelector('img').src = picture;
    fixmeOtherUser.textContent = User.get(fixmeOther).name; fixmeOtherUser.dataset.href = fixmeOther;
    updateQRDisplay({payee: state, currency: this.pending.currency || this.states.currency, imageURL: picture});
    document.querySelector('ul[data-mdl-for="paymentButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="fromCurrencyButton"]').innerHTML = '';
    for (const groupElement of groupsList.children) {
      const key = groupElement.id,
	    group = Group.get(key);
      if (!group) continue; // e.g., a template
      const groupUserData = group.people[state],
	    isMember = groupUserData && !groupUserData.isCandidate,
	    checkbox = groupElement.querySelector('expanding-li label.mdl-checkbox');
      componentHandler.upgradeElement(checkbox); // Otherwise no MaterialCheckbox. (A quirk of Material Design Lite.)
      updateGroupBalance(groupElement, groupUserData?.balance);
      checkbox.MaterialCheckbox[isMember ? 'check' : 'uncheck']();
      if (isMember) {
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="paymentButton"]'); // For receiving menu.
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="fromCurrencyButton"]'); // For receiving menu.
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
    document.querySelector('[for="payAmount"]').textContent = state;
    this.setPayment();
  }

  setPayment() { // Set up whatever can be set up about payment display.
    setTimeout(() => this.pay(false)); // Values are not set yet.
  }
    
  pay(execute) {
    let {payee, amount, currency, group, user} = this.states;
    amount = this.asNumber(amount);
    const fromGroup = Group.get(group);
    function setCosts(cost, balance) {
      fromCost.textContent = cost;
      fromAfter.textContent = balance;
      fromBefore.textContent = balance + cost;
    }
    function getBalance() { // Ugh
      return Group.get(group)?.people[user]?.balance || 0;
    }
    if (!(amount && group && currency && user && payee)) {
      setCosts(0, getBalance());
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
      let message; // Can only be localized to language here in the app.
      if (error instanceof InsufficientReserves) { // Must be before InsufficientFunds because it is a subtype
	const {inputAmount, outputAmount, outputReserve} = error;
	message = `You need ${outputAmount} FairShares from ${fromGroup.name}, but the reserves there only have ${outputReserve}.`;
	setCosts(inputAmount, getBalance() - inputAmount);
      } else if (error instanceof InsufficientFunds) {
	const {cost, balance, groupName} = error;
	message = `You need ${cost} ${groupName}, but you only have ${balance}.`;
	setCosts(cost, balance);
      } else {
	message = error.message;
      }
      payButton.disabled = true;
      document.body.classList.remove('payment-bridge'); // It would be nice if we had a cost to show.
      displayError(message, error.name);
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
  console.error(title, message);
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorDialog.showModal();
}

function updateGroupBalance(groupElement, balance = '') { // 0 is '0', but undefined becomes ''.
  // FIXME: docstring and include membership-based checkbox updates?
  for (const element of groupElement.querySelectorAll('.balance')) element.textContent = balance;
}

function updateGroupDisplay(key, groupElement = document.getElementById(key)) {
  if (!key) return;
  const {name, img, people, fee, stipend} = Group.get(key);
  groupElement.querySelector('expanding-li .mdl-list__item-avatar').setAttribute('src', `images/${img}`);
  groupElement.querySelector('expanding-li .group-name').textContent = name;
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
  fillCurrencyMenu(key, name, 'ul[data-mdl-for="currencyButton"]'); // For payments menu. Any/all currencies, not just the user's groups.
  const peopleList = groupElement.querySelector('.people');
  peopleList.innerHTML = '';
  for (const personKey in people) {
    const {balance, isCandidate = false} = people[personKey];
    const personElement = groupMemberTemplate.content.cloneNode(true);
    const user = User.get(personKey);
    if (personKey === LocalState.states.user) updateGroupBalance(groupElement, balance);
    personElement.querySelector('.membership-action-label').textContent = isCandidate ? 'endorse' : 'expel';
    personElement.querySelector('row > span').textContent = user.name;
    peopleList.append(personElement);
  }  
}

function makeGroupDisplay(key) { // Render the data for a group and it's members.
  const groupElement = groupTemplate.content.cloneNode(true).querySelector('li');
  groupElement.setAttribute('id', key);
  updateGroupDisplay(key, groupElement);
  groupsList.append(groupElement);
}

function fillCurrencyMenu(key, name, listSelector) {
  const currencyChoice = paymentTemplate.content.cloneNode(true).firstElementChild;
  currencyChoice.dataset.key = key;
  currencyChoice.textContent = name;
  document.querySelector(listSelector).append(currencyChoice);
}


// These onclick handlers are wired in index.html. They are exported so that index.html can reference them.
export function pay() { // Actually pay someone (or display error)
  LocalState.pay(true);
  updateGroupDisplay(LocalState.states.group);
}
export function updatePaymentCosts() { // Update display
  LocalState.merge({amount: document.querySelector('input[for="payAmount"]').value});
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
}
export function chooseCurrency(event) { // What the payment is priced in
  LocalState.merge({currency: event.target.dataset.key});
  updatePaymentCosts();
}
export function changeAmount() {
  updatePaymentCosts();
}
export  function userMenu(event) { // Act on user's choice in the user context menu.
  const state = event.target.dataset.href;
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
  LocalState.merge({section: location.hash.slice(1) || 'groups', ...props}, true);
}

addEventListener('popstate', event => event.state && LocalState.merge(event.state, true));
addEventListener('hashchange', hashChange);
addEventListener('load', () => {
  console.log('loading');
  Group.list.forEach(makeGroupDisplay);
  // A hack for our double-labeled switches.
  document.querySelectorAll('.switch-label').forEach(label => label.onclick = (e) => label.nextElementSibling.click(e));
  const params = {}; // Collect any params from query parameters.
  new URL(location).searchParams.forEach((state, key) => params[key] = state);
  hashChange(null, params);
});
