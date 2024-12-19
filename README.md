_**<big>Functional Straw-Person Demo</big>**_

> Synopsis: A working demonstration of FairShare functionality, as a step towards an MVP. The intent is to make the _operations_ concrete. (Not the look and feel.)

> Status: Available **[HERE](app.html)** with canned data, locally persistent across sessions, but without networking across devices. _It's buggy. Now I know more about how to write it._

* auto-gen TOC:
{:toc}

## Concept

### Background

[FairShare](https://www.fairshare.social) is a proposed alternative currency allowing a community to print its own money by creating a basic income funded by a simple transaction tax. 

There is currently no Minimum Viable Product (MVP) defined or built. There is a functional demonstration running as Discord commands [here](https://discord.gg/rkT7AFmu9V), but I find it difficult to get started or to see how the [commands](https://www.fairshare.social/#comp-lahqqv3n) work. _Is there an open repo for this?_


### Opportunity

A real, working app would make things clearer, either for demonstration or for actual use. But this is complicated by not yet having a clear "killer app" or best first use-case -- UX and security design depend on who will use the app, and how it will be used.

Nonetheless, it is possible to move forward. As a first step towards an MVP, we can build a testable and demonstrable single-page Web app that makes an arbitrary cut of what functionality is required.

### Goal and Needs

Get consensus (_among whom?_) on what concrete behavior is needed for an MVP app, and get started on the next steps to produce one.

To that end, it is desirable that the functional straw-person of this project have:
- testable behavior, in an understandable visual display on _mobile and desktop_
- ~readable code, without needing a bunch of specialized knowledge~  (_That was the intent. But it turns out that the exposition of the various fees involves so much "what if", that I wish I had used a dependency-tracking framework from the beginning. As is, the code is neither simple nor robust._)

## High Level Description

### Vision

For this first project I have built a limited, working, single-page Web app. There is no networking or security - just the behaviors acting locally, and locally persisting the data for all users and groups from session to session. It does not coordinate or synchronize between computers. Nonetheless, the behavior is concrete, with specific design decisions described below.
 
A person can switch between three existing users named "Alice", "Bob", and "Carol". The users are distributed among three existing groups:
- The "Apples" group has members Alice and Bob.
- The "Bananas" group has members Bob and Carol.
- The "Coconuts" group has members Carol and Alice.

To allow payment to members of other groups, I have used the [Uniswap](https://docs.uniswap.org/concepts/overview) model:
- In Uniswap [V1](https://docs.uniswap.org/contracts/v1/overview), there is one exchange per group, which has a pool of the group's coin, as well as a pool of a reserve currency common to all exchanges. The various existing versions of Uniswap run on the [Ethereum](https://ethereum.org/en/) blockchain network, in which Ether (ETH) is the universally available reserve currency. Later versions of Uniswap offer more complex variations.
- For our purposes here, I have defined a forth group called "FairShare", in which everyone is a member. 
  - I have used the Unswap V1 math, with each exchange pool using the FairShare coin as the reserve currency.
  - At this time, I have not defined what the "reserve currency" is for the exchange pool of the FairShare group itself. For example, it could be dollars, or ETH, [OP](https://www.optimism.io/), [WLD](https://world.org/blog/announcements/new-world-id-passport-credential-launches-access-wld-tokens), or some such.
  
Everything is handled in whole numbers, with costs rounded up. So with any non-zero fee, there is a minimum 1 unit cost per transaction. (A real MVP would probably use [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt). It might also want to work in "pennies" but displaying "dollars" with two places after the decimal.)

No one can connect to a group that they are not a member of (by design, though not securely enforced by the current implementation). This will prevent leakage of group data or other mischief by non-members. However, it also means that there is no way for a non-member to credit, reserve, or lock another group. (For now, when FairShare currency is transferred between the FairShare group and another group's reserve, the exchange is modeled as a "certificate". See _Basic Security_ in current [Exclusions](#exclusions).)


### Exclusions

Any of the following might turn out to be needed for a real MVP.

The first set is surely needed, but is omitted from this functional straw-person only because I want to focus on the basic monetary operations first. Once such requirements and questions are resolved, I imagine that these would be the next steps. Pushing them off too long exposes some design risk.

- **Voting and Stipend** - To admit or exclude a new member, or change fee and stipend. This is core to FairShare. (I just haven't had time yet. For now, these controls are disabled.)
- **Creating New Groups and New Users** - It changes the implementation slightly when the sets of things are not wired in to the code.
- **Networking** - Of course, all members of a group need to have a shared realtime definition of the state of that group: balances, membership, etc.
- **Basic Security** - The basic use of cryptography to safeguard the operations.
- **Installable App** - Some APIs behave differently when installed on a home screen (e.g., as a [Progressive Web App](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) (PWA)). This facilitates notifications, app stores, etc.

The next group is needed for an MVP, but not necessarily required for establishing the basic behavior:

- **UX design** - A delightful and easy-to-use experience requires two things that I don't have: 1) an understanding of who will use this and what they want to accomplish, and 2) UX talent. However, even within these constraints, the current "engineer's special" UI can surely be improved.
- **State-tracking UI framework** - It's too early to pick a UI framework, _and_ I specifically want people to understand the current code without needing to first learn some specialist system. Thus everything is done in straight-up HTML + CSS + imperative Javascript. It would be more robust, and possibly less code, to use a system that tracked changes to ApplicationState and automatically updated all/only those parts of the UI that need to be updated.
- **Funding** - Although the first group of items above can be done very cheaply, it is still non-zero. An actual release will require some resources, as will UX design.
- **Notifications** - An everyday/allday app like this is most convenient if it is running in the background, and notifies the user when they have received payment (or other _additional services_ activity, see below). Given the construction as a PWA, this is easily added (although some _App Ecosystem Integrations_ need notifications to flow through them.)

Any of the following would be nice for an MVP, but it remains to be seen if they are absolutely necessary. It will likely depend on identifying a best first use-case, and the distribution mechanism for release.

- **group statistics** - e.g., volume of transactions, inequality index, and balance of trade with other group’s currencies. This is omitted until we're happy with the basic operations.
- **delegation** - giving your vote (on candidates, taxes, etc.) to someone else. (Not hard, just not necessary for the basics.)
- **saving past transactions** - The verified transactions could be signed by the present members and stored for later review.
- **external currency in/out** - If the other assumptions here are correct, then it might not be technically difficult to use some external currency in the FairShare group's exchange pool, and implement buying and selling FairShares through venmo/paypal for dollars, or through a blockchain. The regulatory requirements, however, are probably not simple, and could affect everything about the app.
- **localization** - Languages, writing systems, and conventions from around the world. Depending on the use case, this may be a higher priority.
- **app ecosystem integration** - It may be worthwhile to integrate the FairShare app into someone else's app store, SDK, or other ecosystem/platform mechanism. (E.g., as a [World App "mini-app"](https://docs.world.org/mini-apps), which also provides [grants](https://world.org/rfp).) Alternatively, it might be worthwhile to allow other apps to be built into the FairShare platform. (See also, _updates_, below.)
- **updates** - A mechanism to update the group code. Note: Swap systems are often not updatable - new versions run alongside older versions.
- **application sdk** - The core functionality is already available for testing in [NodeJS](https://nodejs.org/en) outside of a browser. This means that a company or other enterprise could create and run applications that trade within or across groups. Packaging a documented [npm](https://www.npmjs.com) package and API would make the ecosystem available, e.g., for activity between members of a [Keiretsu](https://en.wikipedia.org/wiki/Keiretsu) or consortiums, and by client apps written by others.
- **additional services** - Other services could be facilitated through the groups:
  - monetary - e.g., loans and payment schedules, particularly in association with an _application sdk_ for consortiums/syndicates,
  - non-monetary based on group trust - e.g., reputation and message attribution, and
  - mixed - e.g., marketplace.
  
## Technical Description

### Design

This should be evident in the code, which is organized as follows:
  
- [`app.html`](https://github.com/howard-stearns/FairShare/blob/main/app.html) - The static structure, including all screens. (There is no server-side or client-side HTML generator.) However, in a nod to the _Creating New Groups and New Users_ exclusion, above, there are some HTML Template elements.
- [`style.css`](https://github.com/howard-stearns/FairShare/blob/main/style.css) - There are no custom ([Web Component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)) elements (yet), but the HTML does use the [Material Design Lite](https://getmdl.io/index.html) library. The only subtlety is that the app does _not_ dynamically add and remove elements (e.g., as the user navigates to different "screens"). Instead, the inactive elements are simply "turned off" by CSS rules that make use of css classes on the Body element (which the Javascript toggles on and off as needed).
- [`script.js`](https://github.com/howard-stearns/FairShare/blob/main/script.js) - Uses plain modern [ES6](https://www.geeksforgeeks.org/introduction-to-es6/) Javascript. The file makes use of two modules that are the guts of the app: [`application.js`](https://github.com/howard-stearns/FairShare/blob/main/application.js) and [`domain.js`](https://github.com/howard-stearns/FairShare/blob/main/domain.js).
- [`spec/`](https://github.com/howard-stearns/FairShare/blob/main/spec)- This directory holds tests for the two core modules. The tests are run with [jasmine](https://jasmine.github.io/) in a command shell.

The guts of the operations -- the stuff that would be on a server or p2p -- is domain.js. So that might be the place to start.

The local application state -- e.g., what screen the user is on, their current group, who they are paying, as opposed to such _shared_ state such as balances -- is captured in the URL. 

- This allows the browser's forward, back, and history buttons to work in order to get back to "where you were" (modulo balances), and to have discussions by posting URLs to show what is meant.
- It allows things like payee and desired payment currency to be expressed in a URL and QR code. (The "Pay-me code" option in the user menu generates a code that can be read by another phone to get the app and open it to the right screen and some of the data.)

In general, operations within a group are handled atomically by the Group model. E.g, For Alice to Bob in Apples, where both are members of the Apples group:

1. The app's Apples group model determines the cost (Ca) to give Bob an amount of Apples (Aa).
2. The app's Apples group model deducts Ca from Alice's Apples balance, and adds Aa to Bob's Apples balance. The difference is the fee, which is simply taken out of circulation.

This all happens in one atomic operation on the app's Apples group model. Notice that Alice paid the fee for Bob to receive the exact expected amount of Apples.

However, operations between groups may require multiple steps. For example, Alice can pay Carol directly in Coconuts or FairShare as they are both members of both groups. But suppose Alice doesn't have enough of either, and needs to use her large holding of Apples instead. Here's how Alice uses Apples to pay Carol a specific amount (A) of FairShare:

1. The app's FairShare group model determines the FairShare fee to get the cost Cf in FairShare for delivering the intended amount of FairShare (Af). (This is determined by FairShare group's fee.)
2. The app's Apples group model determines the Apples/FairShare exchange rate and fee, and computes the total Apples cost (Ca) of producing Cf FairShare. (This is determined by the Apple group's exchange, acting as an [Automated Market Maker](https://en.wikipedia.org/wiki/Constant_function_market_maker).)
3. The app's Apples group model deducts Ca from Alice's balance of Apples and adds it to its exchange's own Apples holdings.
4. The app's Apples group model deducts Cf from its exchange's own FairShare holdings and generates a certificate for Cf FairShare.
5. The app's FairShare model receives the certificate for Cf FairShare, takes the fee out of circulation, and adds Af to Carol's balance. (A certificate is used between steps 4 and 5 because the Groups can trust their own internal operations, but cannot trust the client or the wire messages to accurately present the number from 4 at step 5. The number is encoded in a certificate.)

Note that the FairShare group reduced the amount of FairShare in circulation by the FairShare fee (Cf - Af). However, in this version, the number of Apples in circulation is not reduced, and the value of the Apples exchange pool is increased by the amount of the Apples fee. (See [Open Questions](#open-questions), below.)

### Open Questions

Writing code forces decisions. I've simplified things by making choices that might not be acceptable for a real app, and would affect the design of an MVP:

**Reserve Currency** - The straw-person uses Uniswap V1 as a model for inter-group exchanges, with the FairShare group as the reserve currency:

1. I'm not sure that a universal group (that has everyone as a member) is in the spirit of FairShare.
2. The app does not directly support using, e.g., Apples to pay someone in Coconuts. Instead, the sender uses the Apples exchange to get reserve currency (FairShare) that is ultimately credited to the receiver's _FairShare_ group account. If they then want to use that to buy Coconuts, that's up to the receiver. (This allows us to not worry about, e.g., attempting to pay in Coconuts when neither sender nor receiver is a member of that group, nor needing to know what groups another user is a member of.)
3. As it stands, no one can hold or invest currency in a group they are not a member of. Is this too limiting?
4. If someone leaves a group (voluntarily or otherwise), their group balance is lost (goes out of circulation) and their investment percentage is split among the other investors. Maybe it should be liquidated (with fees) to the user's reserve currency balance (FairShare)?


**Bootstrapping** - How do members get enough currency to start doing anything? Do they wait until they have accumulated enough from daily stipends? That isn't going to be enough to fund exchange pools for a long time! Maybe either reserve currency (FairShare group) has to start with something significant? Or maybe _external currency in/out_ (see exclusions) is not optional?

**Transaction fees** - There are several assumptions that might not be right:

General principles on fees are:

- Each group has a fee (which may be zero), and calculated costs are rounded up to increase the fee to a whole number.
- Groups charge this whenever a group coin is being credited to a member, and the difference is removed from circulation.
- In principle, exchanges could charge whatever fees they want. However:
  - The fee charged by the exchange is _not_ taken out of circulation, but is instead added to the pool. Thus the ratio of reserve/group coin is weakened by more than just the coin coming into the exchange and the currency going out -- it is slightly further weakened by the fee. Is this right?
  - In this version, the fee is fixed to be the same as whatever the associated group is charging. (Thus people cannot avoid taxes by going through an exchange.) This is different from Uniswap V1, which hardcodes the fee to 0.3% (0.003 x amount).

I assume that the reserve currency group's fee will be low. Is that right?

For example:

- A transaction from one member of a group to another requires one fee paid to the group. The amount to be delivered is increased by the fee, so that the sender pays the extra.
- When investing in an exchange, the (low?) FairShare fee is charged on depositing it with the exchange, so the FairShare cost must be slightly higher. However, the group waves the fee that it transfers from the user's balance to the exchange pool on that same user. (The group will tax it when it comes out in services or profit-taking).
- When a person uses an exchange to pay someone in FairShare, the _exchange_ charges a fee to release its FairShare, and the _FairShare group_ charges its own (presumably low) fee as the receiver's FairShare gets credited. As with intra-group transfers, the requested credit amount is increased so that the sender pays the two fees.
- When an investor withdraws from an exchange, the pool's group and the FairShare group will each take their respective fees. The UI shows the amount removed (i.e., it does not remove extra from the pool), and the UI shows that the credit is slightly less.

**Atomicity** - In the inter-group payment case above, steps 2-4 are atomic and can be handled by one network message. However, there can be changes to fees and exchange rates between 1 and 2, and between 4 and 5. This can result in the recipient being paid slightly more or less than the intended amount. This is a much smaller time window than in Ethereum, and most variances will be absorbed in the rounding process. We do not implement minimum buy limits and maximum sell limits as in Uniswap. (And since operations are immediate, there is no need to implement block-inclusion deadlines.)

**Identity** - Even when _Creating New Groups and New Users_ is implemented (see [Exclusions](#exclusions), above), it should be easy for the user of an app to switch between multiple global identities, and to use a different one for each group if they choose. However, I have assumed that the combination of a username, display name, and picture are globally available to all. For example, when the user presents a QR code for someone else to pay them, that code is the same for all payers, without regard to what groups the payer is in or how the payer knows this particular payee.

### Hosting and Source

The app: [howard-stearns.github.io/FairShare/app.html](https://howard-stearns.github.io/FairShare/app.html) - It is a set of static files hosted on [GitHub](https://pages.github.com), without any applications-specific back-end.  There is _no_ build, [bundle](https://rollupjs.org/), [pack](https://webpack.js.org/), or [transpiler](https://daily.dev/blog/typescript-transpiler-explained) step.

The source: [github.com/howard-stearns/FairShare](https://github.com/howard-stearns/fairshare).

To run the app locally (e.g., after making local changes), you need to [serve the files](https://realpython.com/python-http-server/). I.e., at http://localhost:8000/app.html rather than file:///whatever/fairshare/app.html

