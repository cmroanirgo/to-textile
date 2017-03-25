(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.toTextile = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * @preserve
 * to-textile - an HTML to Textile converter
 *
 * Based on to-markdown by
 * Copyright 2011+, Dom Christie
 *
 * Copyright 2017 (c), cmroanirgo
 * Licenced under the MIT licence
 *
 */

'use strict'

var toTextile
var converters
var texConverters = require('./lib/tex-converters')
var gfmConverters = require('./lib/gfm-converters')
var HtmlParser = require('./lib/html-parser')
var collapse = require('collapse-whitespace')

/*
 * Utilities
 */

var blocks = ['address', 'article', 'aside', 'audio', 'blockquote', 'body',
  'canvas', 'center', 'dd', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hgroup', 'hr', 'html', 'isindex', 'li', 'main', 'menu', 'nav',
  'noframes', 'noscript', 'ol', 'output', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
]

function isBlock (node) {
  return blocks.indexOf(node.nodeName.toLowerCase()) !== -1
}

var voids = [
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]

function isVoid (node) {
  return voids.indexOf(node.nodeName.toLowerCase()) !== -1
}

function htmlToDom (string) {
  var tree = new HtmlParser().parseFromString(string, 'text/html')
  collapse(tree.documentElement, isBlock)
  return tree
}

var _reDecCache = {};
function reDec(val) {
	var re = _reDecCache[val];
	if (re) return re;
	return _reDecCache[val] = re = new RegExp(String.fromCharCode(val), 'g');
}
function unglyph(text) { // the opposites of textile-js' glyph.js, with added HTML entities
	return text
    .replace( reDec(8594) , '->')//reArrow)
    .replace( reDec(215) , ' x ')//reDimsign)
    .replace( reDec(8230) , '...')//reEllipsis)
    .replace( reDec(8212) , ' -- ')//reEmdash)
    .replace( reDec(8211) , ' - ')//reEndash)
    .replace( reDec(8482) , '(tm)')//reTrademark)
    .replace( reDec(174) , '(r)')//reRegistered)
    .replace( reDec(169) , '(c)')//reCopyright)
    .replace( reDec(8243) , '"') //reDoublePrime )
    .replace( reDec(8221) , '"') //reClosingDQuote )
    .replace( reDec(8220) , '"') //reOpenDQuote )
    .replace( reDec(8242) , '\'') //reSinglePrime )
    .replace( reDec(8217) , '\'') //reApostrophe )
    .replace( reDec(8217) , '\'') //reClosingSQuote )
    .replace( reDec(8216) , '\'') //reOpenSQuote )
    .replace( reDec(188) , "(1\/4)" )
    .replace( reDec(189) , "(1\/2)" )
    .replace( reDec(190) , "(3\/4)" )
    .replace( reDec(176) , "(o)" )
    .replace( reDec(177) , "(+\/-)")
    ;
}

/*
 * Flattens DOM tree into single array
 */

function bfsOrder (node) {
  var inqueue = [node]
  var outqueue = []
  var elem
  var children
  var i

  while (inqueue.length > 0) {
    elem = inqueue.shift()
    outqueue.push(elem)
    children = elem.childNodes
    for (i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) inqueue.push(children[i])
    }
  }
  outqueue.shift()
  return outqueue
}

/*
 * Contructs a Textile string of replacement text for a given node
 */

function getContent (node) {
  var text = ''
  for (var i = 0; i < node.childNodes.length; i++) {
    if (node.childNodes[i].nodeType === 1) {
      text += node.childNodes[i]._replacement
    } else if (node.childNodes[i].nodeType === 3) {
      text += node.childNodes[i].data
    } else continue
  }
  return unglyph(text)
}

/*
 * Returns the HTML string of an element with its contents converted
 */

function outer (node, content) {
  return node.cloneNode(false).outerHTML.replace('><', '>' + content + '<')
}

function canConvert (node, filter) {
  if (typeof filter === 'string') {
    return filter === node.nodeName.toLowerCase()
  }
  if (Array.isArray(filter)) {
    return filter.indexOf(node.nodeName.toLowerCase()) !== -1
  } else if (typeof filter === 'function') {
    return filter.call(toTextile, node)
  } else {
    throw new TypeError('`filter` needs to be a string, array, or function')
  }
}

function isFlankedByWhitespace (side, node) {
  var sibling
  var regExp
  var isFlanked

  if (side === 'left') {
    sibling = node.previousSibling
    regExp = / $/
  } else {
    sibling = node.nextSibling
    regExp = /^ /
  }

  if (sibling) {
    if (sibling.nodeType === 3) {
      isFlanked = regExp.test(sibling.nodeValue)
    } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
      isFlanked = regExp.test(sibling.textContent)
    }
  }
  return isFlanked
}

function flankingWhitespace (node, content) {
  var leading = ''
  var trailing = ''

  if (!isBlock(node)) {
    var hasLeading = /^[ \r\n\t]/.test(content)
    var hasTrailing = /[ \r\n\t]$/.test(content)

    if (hasLeading && !isFlankedByWhitespace('left', node)) {
      leading = ' '
    }
    if (hasTrailing && !isFlankedByWhitespace('right', node)) {
      trailing = ' '
    }
  }

  return { leading: leading, trailing: trailing }
}

/*
 * Finds a Textile converter, gets the replacement, and sets it on
 * `_replacement`
 */

function process (node) {
  var replacement
  var content = getContent(node)

  // Remove blank nodes
  if (!isVoid(node) && !/A|TH|TD/.test(node.nodeName) && /^\s*$/i.test(content)) {
    node._replacement = ''
    return
  }

  for (var i = 0; i < converters.length; i++) {
    var converter = converters[i]

    if (canConvert(node, converter.filter)) {
      if (typeof converter.replacement !== 'function') {
        throw new TypeError(
          '`replacement` needs to be a function that returns a string'
        )
      }

      var whitespace = flankingWhitespace(node, content)

      if (whitespace.leading || whitespace.trailing) {
        content = content.trim()
      }
      replacement = whitespace.leading +
        converter.replacement.call(toTextile, content, node) +
        whitespace.trailing
      break
    }
  }

  node._replacement = replacement
}

toTextile = function (input, options) {
  options = options || {}

  if (typeof input !== 'string') {
    throw new TypeError(input + ' is not a string')
  }

  if (input === '') {
    return ''
  }

  // Escape potential ol triggers
  input = input.replace(/(\d+)\. /g, '$1\\. ')

  var clone = htmlToDom(input).body
  var nodes = bfsOrder(clone)
  var output

  converters = texConverters.slice(0)
  if (options.gfm) {
    converters = gfmConverters.concat(converters)
  }

  if (options.converters) {
    converters = options.converters.concat(converters)
  }

  // Process through nodes in reverse (so deepest child elements are first).
  for (var i = nodes.length - 1; i >= 0; i--) {
    process(nodes[i])
  }
  output = getContent(clone)

  // trim excessive whitespaces
  return output.replace(/^[\t\r\n]+|[\t\r\n\s]+$/g, '')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
}

toTextile.isBlock = isBlock
toTextile.isVoid = isVoid
toTextile.outer = outer

module.exports = toTextile

},{"./lib/gfm-converters":2,"./lib/html-parser":3,"./lib/tex-converters":4,"collapse-whitespace":5}],2:[function(require,module,exports){
'use strict'
// TODO:
module.exports = [];

},{}],3:[function(require,module,exports){
/*
 * Set up window for Node.js
 */

var _window = (typeof window !== 'undefined' ? window : this)

/*
 * Parsing HTML strings
 */

function canParseHtmlNatively () {
  var Parser = _window.DOMParser
  var canParse = false

  // Adapted from https://gist.github.com/1129031
  // Firefox/Opera/IE throw errors on unsupported types
  try {
    // WebKit returns null on unsupported types
    if (new Parser().parseFromString('', 'text/html')) {
      canParse = true
    }
  } catch (e) {}

  return canParse
}

function createHtmlParser () {
  var Parser = function () {}

  // For Node.js environments
  if (typeof document === 'undefined') {
    var jsdom = require('jsdom')
    Parser.prototype.parseFromString = function (string) {
      return jsdom.jsdom(string, {
        features: {
          FetchExternalResources: [],
          ProcessExternalResources: false
        }
      })
    }
  } else {
    if (!shouldUseActiveX()) {
      Parser.prototype.parseFromString = function (string) {
        var doc = document.implementation.createHTMLDocument('')
        doc.open()
        doc.write(string)
        doc.close()
        return doc
      }
    } else {
      Parser.prototype.parseFromString = function (string) {
        var doc = new window.ActiveXObject('htmlfile')
        doc.designMode = 'on' // disable on-page scripts
        doc.open()
        doc.write(string)
        doc.close()
        return doc
      }
    }
  }
  return Parser
}

function shouldUseActiveX () {
  var useActiveX = false

  try {
    document.implementation.createHTMLDocument('').open()
  } catch (e) {
    if (window.ActiveXObject) useActiveX = true
  }

  return useActiveX
}

module.exports = canParseHtmlNatively() ? _window.DOMParser : createHtmlParser()

},{"jsdom":undefined}],4:[function(require,module,exports){
'use strict'


var styleFiltersBlock = [
	{
		filter: /padding-left:\s*([0-9]+)\s*em\s*;?/i,
		replacement: function(all, num) { return Array(parseInt(num)+1).join('('); }
	},
	{
		filter: /padding-right:\s*([0-9]+)\s*em\s*;?/i,
		replacement: function(all, num) { return Array(parseInt(num)+1).join(')'); }
	},
	{
		filter: /text-align:\s*left\s*;?\s*;?/i,
		replacement: function() { return '<'; }
	},
	{
		filter: /text-align:\s*right\s*;?/i,
		replacement: function() { return '>'; }
	},
	{
		filter: /text-align:\s*center\s*;?/i,
		replacement: function() { return '='; }
	},
	{
		filter: /text-align:\s*justify\s*;?/i,
		replacement: function() { return '<>'; }
	},
];
var styleFiltersImg = [
	{
		filter: /\Walign:\s*left\s*;?\s*;?/i,
		replacement: function() { return '<'; }
	},
	{
		filter: /\Walign:\s*right\s*;?/i,
		replacement: function() { return '>'; }
	},
	{
		filter: /\Walign:\s*center\s*;?/i,
		replacement: function() { return '='; }
	},
];

function _makeClassId(node) {
	// apply any classes
	if (node.className.length>0 || node.id) {
		var id = '';
		if (node.className.length>0)
			id = node.className; //be indifferent to contents of className
		if (node.id)
			id += '#' + node.id;
		return '('+id+')';
	}
	return '';
}

function _attr(node, filters) {
	var strings = [];
	if (node.style.length) {
		var styles = node.style.cssText;
		
		if (filters)
		for (var i=0; i<filters.length && styles.length>0; i++) {
			var f = filters[i];
			var m = styles.match(f.filter);
			if (m) { // matched the filter
				strings.push(f.replacement.apply(f, m)); // convert
				styles = styles.replace(f.filter, '').trim(); // remove from source string
			}
		}

		// apply the remaining styles
		if (styles.length)
			strings.push('{' + styles + '}');
	}
	return strings.join('') + _makeClassId(node);
}

function attr(node) {
	return _attr(node, null)
}
function attrBlock(node) {
	// TODO. Add Lang='xx' support
	return _attr(node, styleFiltersBlock)
}

function attrImg(node) { // like above, but for images
	return _attr(node, styleFiltersImg)
}



module.exports = [
	{
		filter: 'p',
		replacement: function(content, node) {
			var a = attrBlock(node);
			if (a.length)
				return '\n\np' + a + '. ' + content + '\n\n'
			else
				return '\n\n' + content + '\n\n'

		}
	},

	{
		filter: 'br',
		replacement: function() {
			return '  \n'
		}
	},

	{
		filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
		replacement: function(content, node) {
			var h = node.nodeName.toLowerCase() + attrBlock(node);
			return '\n\n' + h + '. ' + content + '\n\n'
		}
	},

	/*{
		filter: 'hr',
		replacement: function() {
			return '\n\n* * *\n\n'
		}
	},*/

	{
		filter: ['em', 'i'],
		replacement: function(content, node) {
			return '_' + attr(node) + content + '_'
		}
	},

	{
		filter: ['strong', 'b'],
		replacement: function(content, node) {
			return '**' + attr(node) + content + '**'
		}
	},
	{
		filter: ['span'],
		replacement: function(content, node) {
			var a = attr(node);
			if (a=='(caps)')
				// undo textile automatically wrapping [A-Z]{3,} in a <span class="caps">...</span>
				return content;
			return '%' + attr(node) + content + '%'
		}
	},
	{
		filter: ['cite'],
		replacement: function(content, node) {
			return '??' + attr(node) + content + '??'
		}
	},
	{
		filter: ['del'],
		replacement: function(content, node) {
			return '-' + attr(node) + content + '-'
		}
	},
	{
		filter: ['ins'],
		replacement: function(content, node) {
			return '+' + attr(node) + content + '+'
		}
	},
	{
		filter: ['sup'],
		replacement: function(content, node) {
			return '^' + attr(node) + content + '^'
		}
	},
	{
		filter: ['sub'],
		replacement: function(content, node) {
			return '~' + attr(node) + content + '~'
		}
	},

	// Inline code
	{
		filter: function(node) {
			var hasSiblings = node.previousSibling || node.nextSibling
			var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings

			return node.nodeName === 'CODE' && !isCodeBlock
		},
		replacement: function(content, node) {
			return '@' + attr(node) + content + '@'
		}
	},

	{
		filter: function(node) {
			return node.nodeName === 'A' && node.getAttribute('href')
		},
		replacement: function(content, node) {
			var titlePart = node.title ? ' (' + node.title + ')' : '';
			// CM TODO image links: !openwindow1.gif!:http://hobix.com/
			return '\"' + content +  titlePart + '\":' + node.getAttribute('href')
		}
	},

	{
		filter: 'img',
		replacement: function(content, node) {
			var alt = node.alt || ''
			var src = node.getAttribute('src') || '';
			var title = node.title || alt;
			var titlePart = title.length ? '(' + title + ')' : '';
			return src ? '!' + attrImg(node) + src + titlePart + '!' : ''
		}
	},

	// Code blocks
	{
		filter: function(node) {
			return node.nodeName === 'PRE' && node.firstChild.nodeName === 'CODE'
		},
		replacement: function(content, node) {
			return '\n\nbc' + attrBlock(node) + '. ' + node.firstChild.textContent + '\n\n'; 
		}
	},

	{
		filter: 'blockquote',
		replacement: function(content, node) {
			content = content.trim()
			content = content.replace(/\n{3,}/g, '\n\n')
			return '\n\nbq' + attrBlock(node) + '. ' + content + '\n\n'
		}
	},

	{
		filter: 'li',
		replacement: function(content, node) {
			var prefix = /ul/i.test(node.parentNode.nodeName) ? '* ': '# ';
			return prefix + content;
		}
	},

	{
		filter: ['ul', 'ol'],
		replacement: function(content, node) {
			var strings = [];
			var a = attr(node); 
			
			for (var i = 0; i < node.childNodes.length; i++) {
				if (i==0 && a.length) // first LI gets this Lists's attributes
					strings.push(node.childNodes[i]._replacement.replace(/ /, a+' '))
				else
					strings.push(node.childNodes[i]._replacement)
			}
			var hasParent = false;
			while (/li/i.test(node.parentNode.nodeName)) {
				hasParent = true;
				node = node.parentNode.parentNode; // go up to the UL/OL
				var prefix = /ul/i.test(node.nodeName) ? '*': '#';
				for (var i=0; i<strings.length; i++)
					strings[i] = prefix + strings[i];
			}
			if(hasParent)
				return '\n' + strings.join('\n')
			else
				return '\n\n' + strings.join('\n') + '\n\n'

		}
	},

	{
		filter: function(node) {
			return this.isBlock(node)
		},
		replacement: function(content, node) {
			return '\n\n' + this.outer(node, content) + '\n\n'
		}
	},

	// Anything else!
	{
		filter: function() {
			return true
		},
		replacement: function(content, node) {
			return this.outer(node, content)
		}
	}
]

},{}],5:[function(require,module,exports){
'use strict';

var voidElements = require('void-elements');
Object.keys(voidElements).forEach(function (name) {
  voidElements[name.toUpperCase()] = 1;
});

var blockElements = {};
require('block-elements').forEach(function (name) {
  blockElements[name.toUpperCase()] = 1;
});

/**
 * isBlockElem(node) determines if the given node is a block element.
 *
 * @param {Node} node
 * @return {Boolean}
 */
function isBlockElem(node) {
  return !!(node && blockElements[node.nodeName]);
}

/**
 * isVoid(node) determines if the given node is a void element.
 *
 * @param {Node} node
 * @return {Boolean}
 */
function isVoid(node) {
  return !!(node && voidElements[node.nodeName]);
}

/**
 * whitespace(elem [, isBlock]) removes extraneous whitespace from an
 * the given element. The function isBlock may optionally be passed in
 * to determine whether or not an element is a block element; if none
 * is provided, defaults to using the list of block elements provided
 * by the `block-elements` module.
 *
 * @param {Node} elem
 * @param {Function} blockTest
 */
function collapseWhitespace(elem, isBlock) {
  if (!elem.firstChild || elem.nodeName === 'PRE') return;

  if (typeof isBlock !== 'function') {
    isBlock = isBlockElem;
  }

  var prevText = null;
  var prevVoid = false;

  var prev = null;
  var node = next(prev, elem);

  while (node !== elem) {
    if (node.nodeType === 3) {
      // Node.TEXT_NODE
      var text = node.data.replace(/[ \r\n\t]+/g, ' ');

      if ((!prevText || / $/.test(prevText.data)) && !prevVoid && text[0] === ' ') {
        text = text.substr(1);
      }

      // `text` might be empty at this point.
      if (!text) {
        node = remove(node);
        continue;
      }

      node.data = text;
      prevText = node;
    } else if (node.nodeType === 1) {
      // Node.ELEMENT_NODE
      if (isBlock(node) || node.nodeName === 'BR') {
        if (prevText) {
          prevText.data = prevText.data.replace(/ $/, '');
        }

        prevText = null;
        prevVoid = false;
      } else if (isVoid(node)) {
        // Avoid trimming space around non-block, non-BR void elements.
        prevText = null;
        prevVoid = true;
      }
    } else {
      node = remove(node);
      continue;
    }

    var nextNode = next(prev, node);
    prev = node;
    node = nextNode;
  }

  if (prevText) {
    prevText.data = prevText.data.replace(/ $/, '');
    if (!prevText.data) {
      remove(prevText);
    }
  }
}

/**
 * remove(node) removes the given node from the DOM and returns the
 * next node in the sequence.
 *
 * @param {Node} node
 * @return {Node} node
 */
function remove(node) {
  var next = node.nextSibling || node.parentNode;

  node.parentNode.removeChild(node);

  return next;
}

/**
 * next(prev, current) returns the next node in the sequence, given the
 * current and previous nodes.
 *
 * @param {Node} prev
 * @param {Node} current
 * @return {Node}
 */
function next(prev, current) {
  if (prev && prev.parentNode === current || current.nodeName === 'PRE') {
    return current.nextSibling || current.parentNode;
  }

  return current.firstChild || current.nextSibling || current.parentNode;
}

module.exports = collapseWhitespace;

},{"block-elements":6,"void-elements":7}],6:[function(require,module,exports){
/**
 * This file automatically generated from `build.js`.
 * Do not manually edit.
 */

module.exports = [
  "address",
  "article",
  "aside",
  "audio",
  "blockquote",
  "canvas",
  "dd",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "main",
  "nav",
  "noscript",
  "ol",
  "output",
  "p",
  "pre",
  "section",
  "table",
  "tfoot",
  "ul",
  "video"
];

},{}],7:[function(require,module,exports){
/**
 * This file automatically generated from `pre-publish.js`.
 * Do not manually edit.
 */

module.exports = {
  "area": true,
  "base": true,
  "br": true,
  "col": true,
  "embed": true,
  "hr": true,
  "img": true,
  "input": true,
  "keygen": true,
  "link": true,
  "menuitem": true,
  "meta": true,
  "param": true,
  "source": true,
  "track": true,
  "wbr": true
};

},{}]},{},[1])(1)
});