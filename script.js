/*
  TODO:
  - set paymen when changing groups, not when going to section:payme
  - pay  
  - user menu
  - widthraw
  - invest
  - vote
  - genericize
 */

const LocalState = { // An object with methods, which tracks the current choices for this user, across history and sessions. See README.md
  keys: ['section', 'user', 'group', 'groupFilter', 'currency', 'payee'], // What we track. Checks at runtime.

  merge(states, initializeClasses = false) { // Set all the specified states, update the display, and save.
    const merged = Object.assign({}, this.states, this.retrieve(), states);
    const initialHref = location.href;
    if (initializeClasses) { // Startup: Initialize classes and other display.
      const classList = document.body.classList;
      for (let key in merged) {
	let name = merged[key];
	if (!name) continue;
	classList.add(name);
	this[key]?.(name);
      }
    }
    
    let isChanged = false;
    for (let key in merged) {
      isChanged ||= this.update1(key, merged[key]);
    }
    this.states = merged; // After update1, and before save.
    if (isChanged) this.save();
    console.log(JSON.stringify(states), initialHref, JSON.stringify(merged), isChanged, location.href);
  },
  setState(key, state) { // Set one of the states, identified by key. Updates display and saves.
    if (this.update1(key, state)) this.save();
  },
  getState(key) { // Return a single current state value by key.
    return this.states[key];
  },

  // These are called when their key's value is changed, and are used to set things up to match.
  group(state) {
    if (!state) return;
    document.getElementById(state).scrollIntoView();
  },
  groupFilter(state) { // Set the toggle.
    if (groupFilter.checked === !!state) return;
    groupFilter.click();
  },
  payee(state) { // Set the text.
    payee.textContent = getUser(state).name;
  },
  section(state) {
    subtitle.textContent = state;
    switch (state) {
    case 'payme': // Update the URL. FIXME: do this when changing user instead?
      const query = `?payee=alice`,
      url = new URL(query, location.href).href;
      const qrCode = new QRCodeStyling({
	width: 300,
	height: 300,
	type: "svg",
	data: url,
	image: "images/alice.jpeg",
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
      break;
    }
  },

  // Internal machinery.
  states: {groupFilter: 'allGroups'}, // Current values, including initially.
  save() { // Persist for next session, and update browser history, too.
    const string = JSON.stringify(this.states),
	  href = this.url.href;
    localStorage.setItem('localState', string);
    if (href !== location.href) history.pushState(this.states, document.title, href);
  },
  retrieve() { // Get saved state.
    let string = localStorage.getItem('localState');
    return string ? JSON.parse(string) : {};
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
    const classList = document.body.classList;
    if (old) classList.remove(old);
    if (state) classList.add(state);
    this.states[key] = state;
    this[key]?.(state); // Call initializer for key if it is defined here.
    this.updateURL(key, state); // Make the internal url reflect state. Used by save().
    return true;
  },
  updateClasses() {
  }
};

function hashChange() {
  console.log('hashChange');
  LocalState.merge({section: location.hash.slice(1)}, true);
}
function toggleGroup(event) {
  let item = event.target;
  while (!item.hasAttribute('id')) item = item.parentElement;
  console.log('toggleGroup', item);
  const group = item.getAttribute('id');
  if (!group) return;
  LocalState.merge({group: LocalState.getState('group') === group ? '' : group});
}

window.addEventListener('popstate', event => {console.log('popstate', event.state); event.state && LocalState.merge(event.state, true);}); // Triggered by FIXME
window.addEventListener('hashchange', hashChange);
window.addEventListener('load', () => {
  console.log('loading');
  document.querySelectorAll('.switch-label').forEach(label => label.onclick = (e) => label.nextElementSibling.click(e));
  groupFilter.onclick = (e) => LocalState.setState('groupFilter', e.target.checked ? 'allGroups' : '');
  groupsList.onclick = toggleGroup;
  document.querySelector('.mdl-layout__drawer') // Make it close on click.
    .addEventListener('click', () => document.querySelector('.mdl-layout').MaterialLayout.toggleDrawer());

  document.querySelector('[for="userButton"]').onclick = (e) => location.hash = e.target.getAttribute('href'); // User dialog actions.
  payeeMenu.addEventListener('click', (e) => LocalState.merge({payee: e.target.dataset.key}));
  location.hash ||= 'groups'; // Ensure we have one.
  hashChange();
});


/*
function onNavigation() { // Set up display for current location.hash
  let name = location.hash.slice(1);

  if (!['groups', 'pay', 'withdraw', 'invest', 'payme', 'about'].includes(name)) {
    LocalState.setState('group', name);
    let user = getUser(name);
    if (user) {
      payee.textContent = user.name;
      name = 'pay';
    } else {
      name = 'groups';
    }
  }
  LocalState.setState('section', name);
  subtitle.textContent = name;
  if (name === 'payme') {
    const hash = '#alice',
	  url = new URL(hash, location.href).href;
    const qrCode = new QRCodeStyling({
      width: 300,
      height: 300,
      type: "svg",
      data: url,
      image: "images/alice.jpeg",
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
}
*/  
