import { H2, H3, Note, Tip, T } from '../prose'
import { FollowDemo } from '../demos-r15'

export default function InstagramUnfollowersWithoutALogin() {
  return <>
    <p>There are many apps that promise to show who unfollowed you on Instagram. Most of them ask for your username and password, and a common result is an account locked for suspicious activity, or one that starts following strangers on its own. There is a safer way that needs no app at all. Instagram will give you the two lists yourself, and comparing two lists is something a browser can do in a second.</p>
    <H2>Why the login apps are risky</H2>
    <p>Instagram has no public way for another app to read your followers. So these apps sign in as you, from a server somewhere, and scroll through your lists like a very fast person would. Instagram's systems notice logins from unknown places and accounts that read thousands of profiles in a minute. That is why people get locked out. And once you give a password to a stranger's server, you cannot know what else it does with it.</p>
    <H2>Ask Instagram for your lists</H2>
    <p>Open Instagram, go to Accounts Center, then Your information and permissions, then Download your information. Choose some of your information, tick Followers and following, and pick JSON as the format. You can pick a date range, but All time gives the full lists. Instagram prepares the file and sends a notification when it is ready, usually within an hour or two for this small part.</p>
    <p>The download is a ZIP. Inside, under connections and followers_and_following, there are two files that matter: followers_1.json (with _2 and _3 when you have many followers) and following.json. Instagram changed the layout of these files in 2025, and the HTML version looks different again, so a good reader has to know all of them.</p>
    <H2>How the comparison works</H2>
    <p>Once you have both lists, the rest is simple set logic. Anyone you follow who is not in your followers list does not follow you back. Anyone in your followers list whom you do not follow is a fan. Everyone on both lists is mutual. Usernames are compared without case, because Instagram treats Ravi_Runs and ravi_runs as the same account. Try it with a few names:</p>
    <FollowDemo />
    <p><T to="instagram-followers-checker">Instagram Followers Checker</T> does exactly this with your real files. Drop the ZIP or the two JSON or HTML files, switch between Not back, Fans and Mutual, filter by name, open profiles, and save each list as CSV. It also shows when you started following each account, which helps when you want to clean up old follows. There is a Try a sample button if you want to see it before you ask Instagram for anything.</p>
    <H3>Why someone might be missing</H3>
    <p>The lists are a snapshot of the day you asked. Deactivated accounts are left out, and accounts that changed their username show the new name. If a number looks off, ask for a fresh download and compare again.</p>
    <Tip>Do not unfollow a hundred accounts in one sitting. Instagram limits fast actions too. A few dozen a day is safer.</Tip>
    <H2>The same idea works for other apps</H2>
    <p>Almost every app has a download your data page now, and the files are always the same mix of ZIP, JSON and CSV. <T to="x-archive-viewer">X (Twitter) Archive Viewer</T> reads tweets.js from your X archive and shows your posts, replies and reposts with search and stats. <T to="whatsapp-chat-analyzer">WhatsApp Chat Analyzer</T> reads an exported chat and shows who writes most and when. For any other service, <T to="data-export-explorer">Data Export Explorer</T> opens the ZIP, guesses which app it came from and lists every set of records inside, from logins to ad interests, as tables you can save.</p>
    <p>It is worth doing once just to see how much an app keeps. Most exports hold years of searches, logins and a list of ad topics the app thinks you like, and many people are surprised by how long that history goes back.</p>
    <Note title="Why in the browser">Your follower lists say a lot about who you know. These tools read the files inside the tab you have open. Nothing is uploaded, no password is ever asked for, and closing the tab clears everything.</Note>
  </>
}
