/*
  TODO:
  - pay  
  - user menu
  - widthraw
  - invest, including accounting data
  - vote
  - cannot twist down a group you are not in
  - genericize (including, dynamically add group-based css and populating users)
 */

const LocalState = { // An object with methods, which tracks the current choices for this user, across history and sessions. See README.md
  keys: [      // What we track. Checks at runtime.
    'section', // The "page", "screen", or display we are on. In HTML, the standard is to divide the main element into sections.
    'user',    // The current user. One could have multiple "alts" or personas, even within the same group.
    'group',   // What group, if any, are we examining or paying/withdrawing from, or investing in (or last did so).
    'groupFilter', // Whether to show all, or just those that we are a member of.
    'payee',       // Who we are paying (or last paid). Only used in sending money.
    'currency'     // What are currency will the payee be paid in. Only used in sending money.
  ],
  // These two are tracked, but we do not add/remove classes for their values (which are from the same set as user & group).
  unstyled: [ 'payee', 'currency' ],

  merge(states, initializeClasses = false) { // Set all the specified states, update the display, and save.
    const debugHref = location.href, debugStates = this.states, debugRetrieve = this.retrieve();
    const merged = Object.assign({}, this.retrieve(), this.states, states);
    this.pending = merged; // So that initializers can see other pending values.

    if (initializeClasses) { // Startup: Initialize classes and other display.
      for (let key in merged) this.update1(key, merged[key]);
    }
    
    let isChanged = false;
    for (const key in merged) {
      const valueChanged = this.update1(key, merged[key]);
      isChanged ||= valueChanged;
    }
    this.states = merged; // After update1, and before save.
    if (isChanged) this.save();
    console.log(JSON.stringify(states), JSON.stringify(debugStates), JSON.stringify(debugRetrieve), debugHref, JSON.stringify(merged), isChanged, location.href);
  },
  getState(key) { // Return a single current state value by key.
    return this.states[key];
  },

  // These are called when their key's value is changed, and are used to set things up to match.
  section(state) {
    subtitle.textContent = state;
  },
  group(state) {
    let name = Group.get(state)?.name || 'pick one';
    paymeCurrency.textContent = name;
    fromCurrency.textContent = name;
    // Note that WE are asking OTHERS to pay us in our currently chosen group. Compare paying others in their currency.
    updateQRDisplay({payee: this.pending.user || this.states.user, currency: state, imageURL: userButton.querySelector('img').src});
    if (state) document.getElementById(state).scrollIntoView();
  },
  groupFilter(state) { // Set the toggle.
    if (groupFilter.checked === !!state) return;
    groupFilter.click();
  },
  payee(state) { // Set the text.
    payee.textContent = User.get(state).name;
  },
  currency(state) { // The target group for a payment to someone else.
    const {name} = Group.get(state).name;
    currencyExchanged.textContent = currency.textContent = Group.get(state).name;;
  },
  user(state) {  // Set the images, switch user options, and qr code.
    const {name, img} = User.get(state),
	  picture = `images/${img}`,
	  fixmeOther = localPersonas[(localPersonas.indexOf(state)+1) % localPersonas.length];
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
	    checkbox = groupElement.querySelector('expanding-li input[type="checkbox"]');
      if (!isMember) {
	checkbox.removeAttribute('checked');
	continue;
      } // Otherwise, the current user is a member of this group.
      checkbox.setAttribute('checked', 'checked');
      for (const element of groupElement.querySelectorAll('.balance')) element.textContent = groupUserData.balance;
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="paymentButton"]'); // For receiving menu.
      fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="fromCurrencyButton"]'); // For receiving menu.
    }
  },

  // Internal machinery.
  states: {}, // Current/old values.
  save() { // Persist for next session, and update browser history, too.
    const string = JSON.stringify(this.states),
	  href = this.url.href;
    localStorage.setItem('localState', string);
    if (href !== location.href) history.pushState(this.states, document.title, href);
  },
  retrieve() { // Get saved state.
    let string = localStorage.getItem('localState');
    return string ? JSON.parse(string) : {groupFilter: 'allGroups', user: 'alice'};
  },
  get url() { // Maintain a url matching location.href
    return this._url ||= new URL(location.href);
  },
  updateURL(key, value) { // Set the parameter or fragment in the url, to reflect key/value.
    if (key === 'section') { 
      this.url.hash = value;  // Sections appear in the hash of the url.
    } else {
      this.url.searchParams.set(key, value); // Everything else in the query parameters.
    }
  },
  // The sections are display:none by default, but have more specific css that turns a section on
  // if the body has a css class that matches that section. By adding one such section class at a
  // time to the body, we can make exactly one section visible without modifying the dom.
  // Similarly for the other keys.
  update1(key, state) { // Set state as a class on the body element, after removing the class previously set for that key.
    if (!this.keys.includes(key)) throw new Error(`Unknown state '${key}', value '${state}'.`);
    const old = this.states[key];
    if (state === old) return false;
    if (!this.unstyled.includes(key)) {
      const classList = document.body.classList;
      if (old) classList.remove(old); // Subtle: can remove('nonexistent'), but remove('') is an error.
      if (state) classList.add(state);
    }
    this[key]?.(state); // Call initializer for key if it is defined here.
    this.updateURL(key, state); // Make the internal url reflect state. Used by save().
    return true;
  }
};

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
  console.error(message);
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorDialog.showModal();
}

function updatePaymentCosts() {
  let {group, currency, user, payee} = LocalState.states;
  let amount = parseFloat(document.querySelector('input[for="payAmount"]').value || '0');
  let fromAmount = 0;
  const target = Group.get(currency);
  const fromCurrency = Group.get(group);
  const fromBalance = fromCurrency.people[user]?.balance;
  function error(title, message) {
    displayError(message, title);
    payButton.disabled = true;
  }
  fromBefore.textContent = fromBalance;
  payButton.disabled = false;
  if (group !== currency) {
    console.log('Source and target currencies do not match. Trading through FairShare group.');
    document.body.classList.add('payment-bridge');
    const bridgeCurrency = Group.get('fairshare');
    const bridgeBalance = bridgeCurrency.people[user]?.balance;
    const bridgeAmount = target.exchange.computeBuyAmount(amount, target.exchange.totalReserveCurrencyReserve, target.exchange.totalGroupCoinReserve);
    if (bridgeAmount <= 0 || bridgeAmount >= bridgeCurrency.exchange.totalReserveCurrencyReserve) {
      error('Insufficient reserves', `The ${target.name} exchange only has ${bridgeCurrency.exchange.totalReserveCurrencyReserve} FairShare.`);
    }
    bridgeCost.textContent = bridgeAmount;
    if (group === 'fairshare') { // Draw the money directly from your account in the fairshare group.
      fromAmount = fromCurrency.computeTransferFee(bridgeAmount);
      console.log(`Drawing ${fromAmount} from FairShare to cover ${bridgeAmount}.`);
    } else { // Buy fairshare from your selected group's exchange.
      fromAmount = fromCurrency.exchange.computeBuyAmount(bridgeAmount, fromCurrency.exchange.totalGroupCoinReserve, fromCurrency.exchange.totalReserveCurrencyReserve);
      console.log(`Buying ${bridgeAmount} FairShare with ${fromAmount} ${fromCurrency.name}.`);
      if (fromAmount <= 0 || fromAmount >= fromCurrency.exchange.totalReserveCurrencyReserve) {
	error('Insufficient reserves', `The ${fromCurrency.name} exchange only has ${fromCurrency.exchange.totalReserveCurrencyReserve} FairShare.`);
      }
    }
  } else {
    document.body.classList.remove('payment-bridge');
    fromAmount = fromCurrency.computeTransferFee(amount);
  }
  let balanceAfter = fromBalance - fromAmount;
  payButton.textContent = `Pay ${User.get(payee).name} ${amount} ${target.name} using ${fromAmount} ${fromCurrency.name}`;
  if (balanceAfter < 0) error('Insufficient balance', `You only have ${fromBalance} ${fromCurrency.name}.`);
  fromCost.textContent = fromAmount;
  fromAfter.textContent = balanceAfter;
}

function makeGroupDisplay(key) { // Render the data for a group and it's members.
  const {name, img, people, fee, stipend} = Group.get(key);
  const groupElement = groupTemplate.content.cloneNode(true);
  const details = groupElement.querySelector('group-details');
  groupElement.querySelector('li').setAttribute('id', key);
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
  for (const personKey in people) {
    const {balance, isCandidate = false} = people[personKey];
    const personElement = groupMemberTemplate.content.cloneNode(true);
    const user = User.get(personKey);
    personElement.querySelector('.membership-action-label').textContent = isCandidate ? 'endorse' : 'expel';
    personElement.querySelector('row > span').textContent = user.name;
    details.append(personElement);
  }
  groupsList.append(groupElement);
}
function fillCurrencyMenu(key, name, listSelector) {
  const currencyChoice = paymentTemplate.content.cloneNode(true).firstElementChild;
  currencyChoice.dataset.key = key;
  currencyChoice.textContent = name;
  document.querySelector(listSelector).append(currencyChoice);
}


// These onclick handlers are wired in index.html
function toggleGroup() { // Open accordian for group, and make that one current.
  let item = event.target;
  while (!item.hasAttribute('id')) item = item.parentElement;
  const group = item.getAttribute('id');
  if (!group) return;
  // If we're toggling the same group off, just remove it from the body class, without changing state.
  if (LocalState.getState('group') === group) document.body.classList.remove(group);
  else LocalState.merge({group: group});
}
function chooseGroup() { // For someone to pay you. Becomes default group.
  LocalState.merge({group: event.target.dataset.key});
  updatePaymentCosts();
}
function chooseCurrency() { // What the payment is priced in
  LocalState.merge({currency: event.target.dataset.key});
  updatePaymentCosts();
}
function changeAmount() {
  updatePaymentCosts();
}
function userMenu() { // Act on user's choice in the user context menu.
  const state = event.target.dataset.href;
  if (['payme', 'profile', 'addUserKey', 'newUser'].includes(state)) return location.hash = state;
  LocalState.merge({user: state, group: ''});
}
function choosePayee() { // Pick someone to pay.
  LocalState.merge({payee: event.target.dataset.key});
}
function toggleDrawer() { // Close the drawer after navigating.
  document.querySelector('.mdl-layout').MaterialLayout.toggleDrawer();
}
function filterGroups() {
  LocalState.merge({'groupFilter': event.target.checked ? 'allGroups' : ''});
}

function hashChange(event, {...props} = {}) { // A change to a different section.
  LocalState.merge({section: location.hash.slice(1) || 'groups', ...props}, true);
}
window.addEventListener('popstate', event => {console.log('popstate', event.state); event.state && LocalState.merge(event.state, true);}); // Triggered by FIXME
window.addEventListener('hashchange', hashChange);
window.addEventListener('load', () => {
  console.log('loading');
  Group.list().forEach(makeGroupDisplay);
  // A hack for our double-labeled switches.
  document.querySelectorAll('.switch-label').forEach(label => label.onclick = (e) => label.nextElementSibling.click(e));
  const params = {}; // Collect any params from query parameters.
  new URL(location).searchParams.forEach((state, key) => params[key] = state);
  hashChange(null, params);
});
