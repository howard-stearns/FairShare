# Fairshare Prototype

> [This link]() provides a minimal working example of the [FairShare](https://www.fairshare.social) money transfer protocol, showing how it _could_ be implemented. The intent is to have something "good enough to criticize" in developing the requirements and API. 

## Goals

Given a straw-person interpretation of what FairShare might be intended to do, create a realistic attempt at what it might take to build that:

- testable behavior, in an understandable visual display on mobile and desktop
- readable code, without needing a bunch of specialized knowledge
- a realistic security model
- cheap to run

Non-Goal: It isn't trying to define an MVP for users or to assess product-market-fit. 

To that end, this repository implements a real, installable app. (See [Exclusions](#exclusions), below.) The UI code is separated from the actual FairShare behavior:

- The UI is in index.html, style.css, and script.js. It could have been written in React or any number of other frameworks, but I wanted the result to be as understandable as practical to someone who knows a little Javascript, but who may not be familiar with any given framework. It still has to look reasonably nice, so I used [Material Design Lite](https://getmdl.io/index.html), which just simply provides some style for a few of the normal HTML elements (such as button and input).
- The actual group behavior is in fairshare.js, which is used within script.js, and which can also be used directly in a standalone Node.js app. The logic is all self-contained, and there is no application server and no server code. 


## mumble

_positioning claim_

The app is "PWA" that can be used on mobile and desktop directly from [this link](), and optionally installed on one's home screen. The app displays the user's groups and allows the user to pick one and do operations with that group:

- The group operations are handled by a `group` module that connects to all other members of that group who are online at that time.
  - The module could be different for different groups (although it is not different in this PoC).
  - The module could be used alone by other applications (in browser or on a server). 
  - To execute a transaction (giving money or voting), the module signs the transaction request, and the other members who are connected verify the signature and replicate the operation before committing it. Operations are seen and verified only members of the group. 
- Behavior between groups are handled by a `directory` module that connects all users (of any group) currently doing swaps or listing of groups.
  - Multiple such modules could exist, without effecting the behavior within a group.
  - As with groups, different clients and servers can use this module.
  - This module uses a similar signed transaction model.

Since the _directory_ has only the bones of a fake swap protocol, this PoC can't really be used as a complete working system. The intention is only to have enought to see if group architecture is on the right track.



## Group Operations

`getCandidates()` - list prospective members and the current endorsement count.
`endorse(candidate)` - vote to let them into the group, or cancel vote with `unendorse(candidate)`
`getMembers()` - list members  (e.g., so that you can strike one) and the current strike count
`strike(candidate)` - vote to remove them from the group, or cancel vote with `unstrike(candidate)` 
`getRates()` - current tax rate, daily stipend, group name and anonymous voting tally.
`setVote(current tax rate, daily stipend, group name)`, `getVote()`
`getBalance()` - your own
`send(member, amount)` - The recipient must be a member of the group who is also online at the time, and they receive a printable proof that the payment has been transferred.
`transfer(group, amount)` - Create a coupon for amount from your balance, to be redeemed in a different group's currency. Calling `redeem(coupon)` will add the specified amount to your balance. Note: a coupon is a single-use "bearer bond" for a specified amount in a specified group. It might not ultimately be redeemed by the person to whom it was given.
`withdraw()` - unilaterally leave the group

## Directory operations

`join(group)` - request to join. Note that until approved, a candidate will not succeed in connecting to a group. The group module can collect a list of candidates by `getCandidates(group)`.
`


## Exclusions

This is an MVP Proof-of-Concept to see if I have misunderstood the intended behavior, or if additional basic behavior is needed for the idea to actually be testable.

Some behavior that is not implemented:

- **swap market-making** - In this PoC, the _directory_ exchanges between group directly at 1:1.
- **swap to dollars** - ....
- **locks**

- **group statistics** - e.g., volume of transactions, inequality index, and balance of trade with other group’s currencies. This is ommitted until we're happy with the basic operations.
- **delegatation** - giving your vote (on candidates, taxes, etc.) to someone else. (Not hard, just not necessary for the basics.)
- **saving past transactions** - The verified transactions could be signed by the present members and stored for later review.
- **saving pending transactions** - A submitted signed transaction could be saved until such time as multiple members are present, and then verified. 
- **secret group membership** - In order to avoid failures, the app checks that the intended payee is a member of the receiving currency's group.
  - It would be nice to keep your membership secret to those outside the group.
  - Since there are no locks between groups, a transfer between groups takes two steps that cannot be atomic. It would be more robust if either the second step could not fail, or if the **FIXME**

- **trade ratchet between groups** - Does the wealth-condensation ratchet apply to swaps, such that market makers will "condense" the wealth of the actual group members, and eventually only one market maker holding all the coins of all groups? In principle, this could be avoided by imposing a transaction fee on group swaps. The fee might pay for operations (exclusion mentioned immediately above), and perhaps distributing whats left among the groups. Maybe these rates would be voted on by the groups with some weighting. While the PoC mechanism could easily be modified to support this, it is out of scope for this project.
- **additional services** - Other services could be facilitated through the groups, both monetary (loans and payment schedules), non-monetary based on group trust (reputation and message attribution) and mixed (marketplace). These are out of scope.
- **notifications** - An everyday/allday app like this is most convenient if it running in the background, and notifies the user when they have received payment (or other _additioaml services_ activity, see above). Given the construction as a PWA, this is easily added.
- **app ecosystem integration** - It may be worthwhile to integrate the FairShare app into someone else's appstore, SDK, or other eccosystem/platform mechanism. (E.g., as a World App "mini-app", which also provides grants.) Alternatively, it might be worthwhile to allow other apps to be built into the FairShare platform. (See also, _updates_, below.)
- **localization** - Languages, writing systems, and convensions from around the world.

- **vaulted group execution** - The module code will not execute if it has been modified, but someone could create a different app that uses the correct module code in a way that allows the app to observe other group members' transactions or votes. We can package the app differently so that this is not possible, but this PoC does not do so.
- **updates** - A mechanism to update the group code. Note: Swap systems are often not updatable - new versions run alongside older versions.
- **multiple identities** - In this PoC, each user has a single set of keys that are used for signing transactions in all groups, and between groups. We could technically make them distinct, or optionally distinct, but this has social reputation implications that need to be throught through.
- **peer to peer group messages** - Group communications are encrypted such that only the group members can read them, and then distributed through a Multisynq "reflector". The reflector acts as single point of contact between group messages: it receives messages, timestamps them, and forwards to each online member, but it cannot read the messages itself. The reflectors are run by a dynamic set of people who run reflectors on their own harware for a fee. There is also a company, "Multisynq", that charges a nonimal fee for managing the system. The module code that makes use of this can in principle be swapped out for something else, that is not dependent on the Multisynq network.
- **internal persistence of group state** - Only members running unmodified module code can change the group state (e.g., account balances), and this module code kicks off anyone who is not a current member. The group state is then encrypted so that only members running unmodified module code can read it, and the encrypted state is saved in the Multisynq network. Independently of whether _peer to peer group message_ is implemented, the encrypted state could be stored in any other cloud (e.g. ipfs or the like).
- **paying for message distribution and group state persistence** - The multisynq network charges a nonimal fee to support its operations, and also pays people to run reflectors. For this PoC, I am paying Multisynq, and partially defraying that expense by running a reflector on my hardware. Alternatives include folding this behavior into the module (rather than using Multisynq), or instituting a fee in the "directory" group to pay for it.

## Technical Description

### Simplifying Assumptions

1. The Uniswap V1 model is used for trading between groups: one exchange per group, with reserves in some common currency, and trades priced for constant reserve1 * reserve2.
  - As a common "reserve currency", there is a FairShare group that everyone is a member of. (I'm not sure that a universal group is in the spirit of FairShare. Alternatively, there are other ways to do exchanges.)
  - Therefore, exhanges between groups involve first exchaning the starting group's coin for Fairshare (or simply withdrawing if the starting group is the FairShare group), and then using that to buy the group coin of the target group. I.e., there are two transactions.
  - Unlike Unisawp, V1 where the fee for exchange is always 0.3% (0.003 of amount), the exchange fee here is always the same as the agreed group transaction fee. (Is that what is intended? I think if the fee were not the same, people would avoid the fee by exchanging to a low-tax "island" and then exchanging back, no?)
  - The FairShare group also has an exchange, but the PoC doesn't say what it's reserve currency is, nor provide any way to use it. (A real MVP might provide a way to exchange for dollars, but it presumably creates additional regulatory complications. Maybe something through PayPal/Venmo, World Pay, or Apple Pay would work? Or maybe a chain such as Optimism?)
2. Everything is handled in whole numbers, with costs rounded up. So with any non-zero fee, there is a minimum 1 unit cost per transaction. (A real MVP would probably use [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt). It might also want to work in "pennies" but displaying "dollars" with two places after the decimal.)
3. Each group operates independently, without locking. Thus a transfer between groups involves an estimate of the second group's costs in FairShares, and the issuing of a certificate for that amount from the first group's exchange. This means that the final part of the transaction in the second group, could produce slightly more or less than the expected value, if the transaction is large and there are a lot of large exchange transactions occuring at the same time. Becuase of the rounding up in (2), this is unlikely in most cases.
4. More generally, the estimated costs shown for transactions are estimates based on current conditions. The actioal costs could be slightly different when you push the button.

In _this_ PoC version, there is no device-to-device networking, and no cryptography. Group interactions are currently simulated:
  - You can switch between users within the same app page to see the effects on others.
  - This PoC version of the app starts with a few groups and members established, and initial reserve amounts in the exchanges. Changes are persisted locally.
  - When you "vote", the PoC App simulates concurrening votes by the other group memembers in five seconds.


### State

The app has:

- _shared state_ that is the same among all the relevant users in real time. For example, the records of each group are replicated among all members of that group, and the directory of groups and swap prices is replicated among everyone.
- _local state_ that reflects what the current user is doing. This includes the current display (groups, pay, withdraw, etc.), the user for payment when applicable, and group one is working with (e.g, paying from), and any additional groups (e.g, to pay to).
  - The local state is given in whole or in part by the URL:
    1. The browser back/forward buttons should allow the user to go back over what they have done. It doesn't "undo", of course, but it does go back to the right screens and _local_ state, and repeat actions with newly chosen values.
	2. It is convenient to be able to provide a URL in documentation or help that a user can click on to go directly to the right screen. (Of course, the URL merely goes to the right screen -- it does not transfer money without user action.)
    3. An important example of (2) is that each user has the ability to display a QR code that encodes the URL that will pay that user. The paying user can scan that code to bring up the app on the correct screen with the payee and receiving currency filled in.
  - The URL might not encode all the necessary information. For example, the URL from a QR code specifies who whould be paid, but does not specify what account the payer will choose to draw the money from. In this case, the payer may be using primarily one group to pay with, and shouldn't have to specify that again when the app is opened with a new URL. Therefore, local state is persisted locally (on that device), and those values are used by default when not specified by the URL.
  - _Currently_ the local user's current section (screen) is specified in the URL as a fragment identifier (aka a hashtag) because clicking a link to a different fragment doesn't reload the page, and therefore best practice (as expected by screen readers and Material Design Lite) is to use a/href=#something for navigating to different sections. Everything else is specified in the URL with query parameters.
