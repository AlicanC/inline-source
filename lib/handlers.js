var path = require('path')
	, fs = require('fs')
	, _ = require('lodash')
	, Q = require('q');

var handlers = module.exports = {};

handlers['script'] = function scriptHandler(node, handlerOptions, options) {

	console.log('Handling', node);

	// Check if src attribute exists
	var src = _.find(node.attrs, {name: 'src'});
	if (!src) {
		return Q.reject('Inlined <script>\'s must have a "src" attribute.');
	}

	// Get content path
	var contentPath = src.value;

	// Transform node
	node.attrs = _.reject(node.attrs, {name: 'src'});

	// Read the file
	return Q.nfcall(fs.readFile, options.root + contentPath, {encoding: 'utf8'})
		.then(function (content) {

			// Clear any existing child nodes
			node.childNodes = [];

			// Append content in a text node
			node.childNodes.push({
				nodeName: '#text',
				value: content,
				parentNode: node
			});

		});

};

handlers['link'] = function scriptHandler(node, handlerOptions, options) {

	console.log('Handling', node);

	// Check if rel attribute exists
	var rel = _.find(node.attrs, {name: 'rel'});
	if (!rel) {
		return Q.reject('Inlined <link>\'s must have a "rel" attribute.');
	}

	// Check if rel attribute is "stylesheet"
	if (rel.value !== 'stylesheet') {
		return Q.reject('Inlined <link>\'s "rel" attribute must be "stylesheet".');
	}

	// Check if href attribute exists
	var href = _.find(node.attrs, {name: 'href'});
	if (!href) {
		return Q.reject('Inlined <link>\'s must have a "href" attribute.');
	}

	// Get content path
	var contentPath = href.value;

	// Transform node from <link> to <style>
	node.attrs = _.reject(node.attrs, {name: 'rel'});
	node.attrs = _.reject(node.attrs, {name: 'href'});
	node.nodeName = 'style';
	node.tagName = 'style';

	// Read the file
	return Q.nfcall(fs.readFile, options.root + contentPath, {encoding: 'utf8'})
		.then(function (content) {

			console.log('Got file', content);

			// Clear any child nodes and append content in a text node
			node.childNodes = [{
				nodeName: '#text',
				value: content,
				parentNode: node
			}];

			console.log('appended');

		});

};