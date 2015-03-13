var path = require('path')
	, fs = require('fs')
	, _ = require('lodash')
	, Q = require('q')
	, parse5 = require('parse5')
	, parse5Utils = require('parse5-utils')
	, handlers = require('./lib/handlers.js');

function checkOptions(options) {

	return _.assign({
		tags: ['script', 'link'],
		inlineAttribute: 'inline',
		handlers: {
			'script': {

			},
			'link': {
				
			}
		}
	}, options)

}

module.exports = function inline(html, options, callback) {

	options = checkOptions(options);

	// Initialize the parser
	var parser = new parse5.Parser();

	// Parse the HTML
	var documentFragment = parser.parseFragment(html);

	// Define the node inliner
	var inlineNode = function inlineNode(node) {

		// Check if we are interested in this tag
		if (options.tags.indexOf(node.tagName) === -1) {
			return;
		}

		// Check if the tag has the inline attribute
		if (!_.find(node.attrs, {name: options.inlineAttribute})) {
			return;
		}

		// Remove the inline attribute
		node.attrs = _.reject(node.attrs, {name: options.inlineAttribute});

		// Find the handler for the tag
		var handler = handlers[node.tagName];

		// Check if we could
		if (!handler) {
			return Q.reject('Could not find a handler for tag "' + node.tagName + '".');
		}

		// Pass the node to the handler
		return handler(node, options.handlers[node.tagName], options);

	};

	// The tasks array
	var tasks = [];

	// Define the walker
	var walker = function walker (node) {

		// Inline the node
		var task = inlineNode(node);

		// Add task to the list
		if (task) {
			tasks.push(task);
		}

		// Keep walking
		if (node.childNodes) {
			node.childNodes.forEach(walker);
		}

	};

	// Walk nodes
	walker(documentFragment);

	// Initialize the serializer
	var serializer = new parse5.Serializer();

	// Wait for tasks and resolve with serialized fragment
	return Q.all(tasks)
		.then(function () {

			return serializer.serialize(documentFragment);

		})
		.nodeify(callback);

}

// Expose steps
/*module.exports.parse = parse;
module.exports.inline = inline;*/

/**
 * Configure 'options'
 * @param {Object} options
 * @returns {Object}
 */
function config (options) {
	if (!options || !options.config) {
		options = options || {};
		if (options.compress == null) options.compress = true;
		if (options.swallowErrors == null) options.swallowErrors = true;
		if (options.attribute == null) options.attribute = 'inline';
		options.rootpath = options.rootpath
			? path.resolve(options.rootpath)
			: process.cwd();
		if (options.inlineJS == null) options.inlineJS = true;
		if (options.inlineCSS == null) options.inlineCSS = true;
		options.reInlineSource = new RegExp('^\\s*?(<script.*?\\s' + options.attribute + '.*?[^<]+<\\/script>)', 'gm');
		options.reInlineHref = new RegExp('^\\s*?(<link.*?\\s' + options.attribute + '[^>]*>)', 'gm');
		options.config = true;
	}

	return options;
}

/**
 * Parse 'html' for inlineable sources
 * @param {String} htmlpath
 * @param {String} html
 * @param {Object} options
 * @returns {Array}
 */
function parse (htmlpath, html, options) {
	// In case this is entry point, configure
	options = config(options);

	// Remove file name if necessary
	htmlpath = path.extname(htmlpath).length ? path.dirname(htmlpath) : htmlpath;

	var sources = []
		, match;

	var getSource = function (type, context) {
		return {
			context: context,
			filepath: getPath(type, match[1], htmlpath, options.rootpath),
			inline: (type == 'js') ? options.inlineJS : options.inlineCSS,
			type: type
		}
	}

	// Parse inline <script> tags
	while (match = options.reInlineSource.exec(html)) {
		sources.push(getSource('js', match[1]));
	}

	// Parse inline <link> tags
	while (match = options.reInlineHref.exec(html)) {
		sources.push(getSource('css', match[1]));
	}

	return sources;
}

/**
 * Retrieve filepath for 'source'
 * @param {String} type
 * @param {String} source
 * @param {String} htmlpath
 * @param {String} rootpath
 * @returns {String}
 */
function getPath (type, source, htmlpath, rootpath) {
	var isCSS = (type == 'css')
		// Parse url
		, sourcepath = source.match(isCSS ? RE_HREF : RE_SRC)[1]
		, filepath = sourcepath.indexOf('/') == 0
			// Absolute
			? path.resolve(rootpath, sourcepath.slice(1))
			// Relative
			: path.resolve(htmlpath, sourcepath);

	return filepath;
}

/**
 * Inline 'sources' into 'html'
 * @param {Array} source
 * @param {String} html
 * @param {Object} options
 * @returns {String}
 */
function inline (sources, html, options) {
	// In case this is entry point, configure
	options = config(options);

	var clean = function (source) { return source.context.replace(' ' + options.attribute, ''); }
		, type, content;

	if (sources.length) {
		sources.forEach(function (source) {
			if (source.inline) {
				type = source.type;
				try {
					// Read from File instance if passed
					// (popeindustries/buddy optimization)
					content = source.instance
						? source.instance.content
						: fs.readFileSync(source.filepath, 'utf8');
					// Compress if set
					if (options.compress) content = compressContent(type, content);
					content = wrapContent(type, content);
				} catch (err) {
					if (!options.swallowErrors) throw err;
					// Remove 'inline' attribute if error loading content
					content = clean(source);
				}
			// Disabled via options.inlineXX
			} else {
				// Remove 'inline' attribute
				content = clean(source);
			}

			// Replace inlined content in html (PR #5)
			html = html.replace(source.context, function () { return content; });
		});
	}

	return html;
}

/**
 * Compress 'content' of 'type'
 * @param {String} type
 * @param {String} content
 * @returns {String}
 */
function compressContent (type, content) {
	try {
		content = (type == 'css')
			? csso.justDoIt(content)
			: uglify.minify(content, {fromString: true}).code;
	} catch (err) { /* return uncompressed if error */ }

	return content;
}
