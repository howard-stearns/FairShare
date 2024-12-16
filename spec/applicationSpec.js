// Unit tests for domain.js.
// All tests are run together with: jasmine
// after installing with: npm install --global jasmine

import {ApplicationState} from '../application.js';
import {Group} from '../domain.js';

describe('Application', function () {
  let storage, changed, LocalState;
  function clear() { storage = '{}'; changed = []; LocalState = new App(); }
  class App extends ApplicationState { // Provided by the specific application implementation.
    payee(name) {
      changed.push({payee: name});
    }
    save() {
      storage = JSON.stringify(this.states);
    }
    retrieve() {
      return JSON.parse(storage);
    }
    stateChanged(key, oldState, newState) {
      changed.push({key, oldState, newState});
    }
  };
  beforeEach(clear);
    
  it('starts with no state (before first merge).', function () {
    expect(LocalState.keys.every(key => LocalState.getState(key) === undefined)).toBeTruthy();
  });
  describe('merge', function () {
    it('sets all specified values.', function () {
      const section = 'group',
	    user = 'alice',
	    group = 'fairshare';
      LocalState.merge({section, user, group});
      expect(LocalState.getState('section')).toBe(section);
      expect(LocalState.getState('user')).toBe(user);
      expect(LocalState.getState('group')).toBe(group);    
    });
    it('does not reset values that are not specified.', function () {
      const section = 'group', user = 'alice';
      LocalState.merge({section});
      LocalState.merge({user});
      expect(LocalState.getState('section')).toBe(section);
    });
    it('persists specified values.', function () {
      const section = 'group',
	    user = 'alice',
	    group = 'fairshare';;
      LocalState.merge({section});
      LocalState.merge({user});

      // Simulate a reload.
      const saved = storage; 
      clear();
      storage = saved;

      expect(LocalState.getState('section')).toBeUndefined();
      expect(LocalState.getState('user')).toBeUndefined();
      expect(LocalState.getState('group')).toBeUndefined();
      LocalState.merge({section: 'pay', group}); // merge brings in persisted data.
      expect(LocalState.getState('section')).toBe('pay'); // latest value overrides persisted
      expect(LocalState.getState('user')).toBe(user);
      expect(LocalState.getState('group')).toBe(group);      
    });
    it('calls stateChanged when actually changed.', function () {
      const section = 'group';
      LocalState.merge({section});
      expect(changed.pop()).toEqual({key: 'section', oldState: undefined, newState: section});
      LocalState.merge({section});
      expect(changed.length).toBe(0);
      LocalState.merge({section: 'pay'});
      expect(changed.pop()).toEqual({key: 'section', oldState: section, newState: 'pay'});
    });
    it('calls initializer method if defined for changed state.', function () {
      const payee = 'bob';
      LocalState.merge({payee});
      expect(changed.pop()).toEqual({payee});
      expect(changed.pop()).toEqual({key: 'payee', oldState: undefined, newState: payee});
      LocalState.merge({payee});
      expect(changed.length).toBe(0);
      LocalState.merge({payee: 'carol'});
      expect(changed.pop()).toEqual({payee: 'carol'});
    });
  });

  describe('operations', function () {
    beforeAll(function () {
      Group.create({ name: "Apples", fee: 1, stipend: 1, img: "apples.jpeg", people: { alice: {balance: 100}, bob: {balance: 200} }});
      Group.create({ name: "FairShare", fee: 2, stipend: 10, img: "fairshare.webp", people: { alice: {balance: 100}, bob: {balance: 100}, carol: {balance: 100} } });
    });
    describe('payment', function () {
      it('does smokes', function () {
	LocalState.merge({user: 'alice', group: 'apples', currency: 'apples', payee: 'bob', amount: 10});
	LocalState.pay(false);
      });
    });
    describe('investment', function () {
      it('invest smokes.', function () {
	LocalState.merge({user: 'alice', group: 'apples', investment: 10});
	LocalState.invest(false);
      });
      it('withdraw smokes.', function () {
        LocalState.merge({user: 'alice', group: 'apples', investment: -10});
	LocalState.invest(false);
      });
    });
  });
});
