import './show-names.css';
import React from 'dom-chef';
import * as pageDetect from 'github-url-detection';

import features from '../feature-manager';
import * as api from '../github-helpers/api';
import {getUsername, compareNames} from '../github-helpers';
import observe from '../helpers/selector-observer';
import batchedFunction from '../helpers/batched-function';
import {removeTextNodeContaining} from '../helpers/dom-utils';

// The selector observer calls this function several times, but we want to batch them into a single GraphQL API call
const batchUpdateLinks = batchedFunction(async (batchedUsernameElements: HTMLAnchorElement[]): Promise<void> => {
	// TODO: Split up this function, it does too much
	const usernames = new Set<string>();
	const myUsername = getUsername();
	for (const element of new Set(batchedUsernameElements)) {
		const username = element.textContent;
		if (username && username !== myUsername && username !== 'ghost') {
			usernames.add(element.textContent!);
		}

		// Drop 'commented' label to shorten the copy
		const commentedNode = element.parentNode!.nextSibling;
		if (element.closest('.timeline-comment-header') && commentedNode) {
			// "left a comment" appears in the main comment of reviews
			removeTextNodeContaining(commentedNode, /commented|left a comment/);
		}
	}

	if (usernames.size === 0) {
		return;
	}

	const names = await api.v4(
		[...usernames].map(user =>
			api.escapeKey(user) + `: user(login: "${user}") {name}`,
		).join(','),
	);

	for (const usernameElement of batchedUsernameElements) {
		const username = usernameElement.textContent!;
		const userKey = api.escapeKey(username);

		// For the currently logged in user, `names[userKey]` would not be present
		const {name} = names[userKey] ?? {};
		if (!name) {
			continue;
		}

		// If it's a regular comment author, add it outside <strong> otherwise it's something like "User added some commits"
		if (compareNames(username, name)) {
			usernameElement.textContent = name;
			continue;
		}

		const {parentElement} = usernameElement;
		const insertionPoint = parentElement!.tagName === 'STRONG' ? parentElement! : usernameElement;
		insertionPoint.after(
			' ',
			<span className="color-fg-muted css-truncate d-inline-block">
				(<bdo className="css-truncate-target" style={{maxWidth: '200px'}}>{name}</bdo>)
			</span>,
			' ',
		);
	}
});

const usernameLinksSelector = [
	// `a` selector needed to skip commits by non-GitHub users
	':is(.js-discussion, .inline-comments) a.author:not([href*="/apps/"], [href*="/marketplace/"], [data-hovercard-type="organization"])',

	// On dashboard `.text-bold` is required to not fetch avatars
	'#dashboard a.text-bold[data-hovercard-type="user"]',

	// Due to: https://github.com/g-plane/typed-query-selector/issues/26
] as unknown as Array<'a'>;

function init(signal: AbortSignal): void {
	observe(usernameLinksSelector, batchUpdateLinks, {signal});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.isDashboard,
		pageDetect.hasComments,
	],
	awaitDomReady: false,
	init,
});
