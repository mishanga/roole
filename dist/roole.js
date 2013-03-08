/*
 * Roole - A language that compiles to CSS v0.3.1
 * http://roole.org
 *
 * Copyright 2012 Glen Huang
 * Released under the MIT license
 */
var roole = (function() {

/**
 * Defaults
 *
 * A collection of default options.
 */
var defaults = {
	filePath: '',
	imports: {},
	prefix: ['webkit', 'moz', 'ms', 'o'],
	indent: '\t',
	precision: 3
}

/**
 * Helper
 *
 * A collection of general utility functions used by other modules.
 */
var _ = {}

_.noop = function() {}

_.capitalize = function(string) {
	return string.charAt(0).toUpperCase() + string.substr(1)
}

// shallow flatten
_.flatten = function(array) {
	var flattenedArray = []
	array.forEach(function(item) {
		if (Array.isArray(item))
			flattenedArray = flattenedArray.concat(item)
		else
			flattenedArray.push(item)
	})
	return flattenedArray
}

_.intersect = function(arr1, arr2) {
	return arr1.filter(function(item) {
		return ~arr2.indexOf(item)
	})
}

_.dirname = function(path) {
	if (!path)
		return '.'

	var parts = path.split('/')
	parts.pop()
	return parts.join('/') || '.'
}

_.joinPaths = function(path1, path2) {
	return _.normalizePath(path1 + '/' + path2)
}

_.normalizePath = function (path) {
	var parts = path.split('/').filter(function(p) {
		return p
	})

	var i = parts.length
	var up = 0
	var last
	while (--i >= 0) {
		last = parts[i]
		if (last === '.')
			parts.splice(i, 1)
		else if (last === '..') {
			parts.splice(i, 1)
			++up
		}
		else if (up) {
			parts.splice(i, 1)
			--up
		}
	}

	return parts.join('/')
}

/**
 * Err
 *
 * Thin wrapper around Error to add meta info to the error instance.
 */
var Err = function(message, node, filePath) {
	var error = new Error(message)

	error.line = node.loc.line
	error.column = node.loc.column
	error.offset = node.loc.offset
	error.filePath = filePath

	return error
}

/**
 * Node
 *
 * A collection of node utility functions.
 */
var Node = function(type, children, properties) {
	if (!Array.isArray(children)) {
		properties = children
		children = null
	}

	var node = properties || {}

	node.type = type

	if (children)
		node.children = children

	return node
}

Node.clone = function(node, deep) {
	if (Array.isArray(node))
		return node.map(function(node) {
			return Node.clone(node)
		})

	if (node === null || typeof node !== 'object')
		return node

	var clone = Object.create(node)

	if (deep === undefined)
		deep = true

	if (deep && node.children)
		clone.children = Node.clone(node.children)

	return clone
}

Node.equal = function(node1, node2) {
	if (Array.isArray(node1) || Array.isArray(node2)) {
		if (!Array.isArray(node1) || !Array.isArray(node2))
			return false

		if (node1.length !== node2.length)
			return false

		return node1.every(function(childNode1, i) {
			var childNode2 = node2[i]
			return Node.equal(childNode1, childNode2)
		})
	}

	if (node1 === null ||
	    typeof node1 !== 'object' ||
	    node2 === null ||
	    typeof node2 !== 'object'
	)
		return node1 === node2

	if (node1.type !== node2.type)
		return false

	if (!node1.children && !node2.children)
		return true

	if (!node1.children || !node2.children)
		return false

	return Node.equal(node1.children, node2.children)
}

Node.containSelector = function(needleSelector, haystackSelector) {
	var index = -1
	var needles = needleSelector.children
	var haystack = haystackSelector.children
	var firstNeedle = needles[0]
	haystack.some(function(node, i) {
		if (Node.equal(firstNeedle, node)) {
			index = i
			return true
		}
	})
	if (!~index)
		return index

	for (var i = 1, length = needles.length; i < length; ++i) {
		if (!Node.equal(needles[i], haystack[i + index]))
			return -1
	}

	return index
}

Node.toNumber = function(node) {
	switch (node.type) {
	case 'number':
	case 'percentage':
	case 'dimension':
		return node.children[0]
	default:
		return null
	}
}

Node.toBoolean = function(node) {
	switch (node.type) {
	case 'boolean':
		return node.children[0]
	case 'number':
	case 'percentage':
	case 'dimension':
		return !!node.children[0]
	case 'identifier':
	case 'string':
		return node.children.length !== 1 || !!node.children[0]
	}

	return true
}

Node.toListNode = function(rangeNode) {
	var fromNode = rangeNode.children[0]
	var fromNumber = fromNode.children[0]

	var operator = rangeNode.children[1]
	var exclusive = operator.length === 3

	var toNode = rangeNode.children[2]
	var toNumber = toNode.children[0]

	var stepNumber = fromNumber < toNumber ? 1 : -1

	var itemNodes = []
	var i = 0
	while (
		exclusive ?
			stepNumber > 0 && fromNumber < toNumber ||
			stepNumber < 0 && fromNumber > toNumber
		:
			stepNumber > 0 && fromNumber <= toNumber ||
			stepNumber < 0 && fromNumber >= toNumber
	) {
		if (i++)
			itemNodes.push(Node('separator', [' '], {loc: rangeNode.loc}))

		var fromClone = Node.clone(fromNode)
		fromClone.children[0] = fromNumber
		itemNodes.push(fromClone)

		fromNumber += stepNumber
	}

	if (!itemNodes.length)
		return Node('null', {loc: rangeNode.loc})

	if (itemNodes.length === 1)
		return itemNodes[0]

	return Node('list', itemNodes, {loc: rangeNode.loc})
}

/**
 * Generated Parser
 *
 * Parse the input code.
 */
var generatedParser = (function(){
  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */
  
  function subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }
  
  function quote(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
     return '"' + s
      .replace(/\\/g, '\\\\')  // backslash
      .replace(/"/g, '\\"')    // closing quote character
      .replace(/\x08/g, '\\b') // backspace
      .replace(/\t/g, '\\t')   // horizontal tab
      .replace(/\n/g, '\\n')   // line feed
      .replace(/\f/g, '\\f')   // form feed
      .replace(/\r/g, '\\r')   // carriage return
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
      + '"';
  }
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successful,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input) {
      var parseFunctions = {
        "root": parse_root,
        "selector": parse_selector,
        "mediaQuery": parse_mediaQuery
      };
      
      var options = arguments.length > 1 ? arguments[1] : {},
          startRule;
      
      if (options.startRule !== undefined) {
        startRule = options.startRule;
        
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Can't start parsing from rule " + quote(startRule) + ".");
        }
      } else {
        startRule = "root";
      }
      
      var pos = 0;
      var reportedPos = 0;
      var cachedReportedPos = 0;
      var cachedReportedPosDetails = { line: 1, column: 1, seenCR: false };
      var reportFailures = 0;
      var rightmostFailuresPos = 0;
      var rightmostFailuresExpected = [];
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        var escapeChar;
        var length;
        
        if (charCode <= 0xFF) {
          escapeChar = 'x';
          length = 2;
        } else {
          escapeChar = 'u';
          length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function computeReportedPosDetails() {
        function advanceCachedReportedPos() {
          var ch;
          
          for (; cachedReportedPos < reportedPos; cachedReportedPos++) {
            ch = input.charAt(cachedReportedPos);
            if (ch === "\n") {
              if (!cachedReportedPosDetails.seenCR) { cachedReportedPosDetails.line++; }
              cachedReportedPosDetails.column = 1;
              cachedReportedPosDetails.seenCR = false;
            } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
              cachedReportedPosDetails.line++;
              cachedReportedPosDetails.column = 1;
              cachedReportedPosDetails.seenCR = true;
            } else {
              cachedReportedPosDetails.column++;
              cachedReportedPosDetails.seenCR = false;
            }
          }
        }
        
        if (cachedReportedPos !== reportedPos) {
          if (cachedReportedPos > reportedPos) {
            cachedReportedPos = 0;
            cachedReportedPosDetails = { line: 1, column: 1, seenCR: false };
          }
          advanceCachedReportedPos();
        }
        
        return cachedReportedPosDetails;
      }
      
      function offset() {
        return reportedPos;
      }
      
      function line() {
        return computeReportedPosDetails().line;
      }
      
      function column() {
        return computeReportedPosDetails().column;
      }
      
      function matchFailed(failure) {
        if (pos < rightmostFailuresPos) {
          return;
        }
        
        if (pos > rightmostFailuresPos) {
          rightmostFailuresPos = pos;
          rightmostFailuresExpected = [];
        }
        
        rightmostFailuresExpected.push(failure);
      }
      
      function parse_root() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        r3 = parse_multiLineComment();
        if (r3 !== null) {
          reportedPos = r4;
          r3 = (function(c) {return N('comment', [c])})(r3);
        }
        if (r3 === null) {
          pos = r4;
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r6 = pos;
            r7 = pos;
            r8 = parse_rootRules();
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(r) {return r})(r8);
            }
            if (r5 === null) {
              pos = r6;
            }
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(comment, rules) {
        		if (!rules) rules = []
        		if (comment) rules.unshift(comment)
        		return N('root', rules)
        	})(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rootRules() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rootRule();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            r9 = parse_rootRule();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(r) {return r})(r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_rootRule();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(r) {return r})(r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return rest
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rootRule() {
        var r0;
        
        r0 = parse_ruleset();
        if (r0 === null) {
          r0 = parse_assignment();
          if (r0 === null) {
            r0 = parse_media();
            if (r0 === null) {
              r0 = parse_void();
              if (r0 === null) {
                r0 = parse_block();
                if (r0 === null) {
                  r0 = parse_import();
                  if (r0 === null) {
                    r0 = parse_if();
                    if (r0 === null) {
                      r0 = parse_for();
                      if (r0 === null) {
                        r0 = parse_mixinCall();
                        if (r0 === null) {
                          r0 = parse_keyframes();
                          if (r0 === null) {
                            r0 = parse_fontFace();
                            if (r0 === null) {
                              r0 = parse_charset();
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return r0;
      }
      
      function parse_ruleset() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_selectorList();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_ruleList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(selectorList, ruleList) {
        		return N('ruleset', [selectorList, ruleList])
        	})(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_selectorList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_selector();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r9 = ",";
              pos++;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_selector();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(s) {return s})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r9 = ",";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_selector();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(s) {return s})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('selectorList', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_selector() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        r5 = pos;
        r6 = parse_nonSpaceCombinator();
        if (r6 !== null) {
          r7 = parse__();
          if (r7 !== null) {
            r3 = [r6, r7];
          } else {
            r3 = null;
            pos = r5;
          }
        } else {
          r3 = null;
          pos = r5;
        }
        if (r3 !== null) {
          reportedPos = r4;
          r3 = (function(c) {return c})(r6);
        }
        if (r3 === null) {
          pos = r4;
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse_compoundSelector();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(combinator, compoundSelector) {
        		if (combinator) compoundSelector.unshift(combinator)
        		return N('selector', compoundSelector)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_compoundSelector() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_simpleSelector();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse_combinator();
          if (r8 !== null) {
            r9 = parse_simpleSelector();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(c, s) {s.unshift(c); return s})(r8, r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse_combinator();
            if (r8 !== null) {
              r9 = parse_simpleSelector();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(c, s) {s.unshift(c); return s})(r8, r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		if (rest.length) rest = first.concat(_.flatten(rest))
        		else rest = first
        
        		return rest
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_combinator() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_nonSpaceCombinator();
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(nonSpaceCombinator) {
        		return nonSpaceCombinator
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_spaceCombinator();
        }
        return r0;
      }
      
      function parse_nonSpaceCombinator() {
        var r0, r1;
        
        r1 = pos;
        if (/^[>+~]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[>+~]");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('combinator', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_spaceCombinator() {
        var r0, r1;
        
        r1 = pos;
        r0 = parse_s();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() {
        		return N('combinator', [' '])
        	})();
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_simpleSelector() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_baseSelector();
        if (r3 === null) {
          r3 = parse_suffixSelector();
        }
        if (r3 !== null) {
          r4 = [];
          r5 = parse_suffixSelector();
          while (r5 !== null) {
            r4.push(r5);
            r5 = parse_suffixSelector();
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return rest
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_baseSelector() {
        var r0;
        
        r0 = parse_selectorInterpolation();
        if (r0 === null) {
          r0 = parse_typeSelector();
          if (r0 === null) {
            r0 = parse_universalSelector();
            if (r0 === null) {
              r0 = parse_ampersandSelector();
            }
          }
        }
        return r0;
      }
      
      function parse_suffixSelector() {
        var r0;
        
        r0 = parse_hashSelector();
        if (r0 === null) {
          r0 = parse_classSelector();
          if (r0 === null) {
            r0 = parse_attributeSelector();
            if (r0 === null) {
              r0 = parse_negationSelector();
              if (r0 === null) {
                r0 = parse_pseudoSelector();
              }
            }
          }
        }
        return r0;
      }
      
      function parse_selectorInterpolation() {
        var r0, r1;
        
        r1 = pos;
        r0 = parse_variable();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('selectorInterpolation', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_typeSelector() {
        var r0, r1;
        
        r1 = pos;
        r0 = parse_identifier();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('typeSelector', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_universalSelector() {
        var r0, r1;
        
        r1 = pos;
        if (input.charCodeAt(pos) === 42) {
          r0 = "*";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"*\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() {
        		return N('universalSelector')
        	})();
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_ampersandSelector() {
        var r0, r1;
        
        r1 = pos;
        if (input.charCodeAt(pos) === 38) {
          r0 = "&";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"&\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() {
        		return N('ampersandSelector')
        	})();
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_hashSelector() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 35) {
          r3 = "#";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"#\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_identifier();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('hashSelector', [value])
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_classSelector() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 46) {
          r3 = ".";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\".\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_identifier();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('classSelector', [value])
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_attributeSelector() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 91) {
          r3 = "[";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_identifier();
            if (r5 !== null) {
              r7 = pos;
              r8 = pos;
              r9 = parse__();
              if (r9 !== null) {
                if (input.substr(pos, 2) === "^=") {
                  r10 = "^=";
                  pos += 2;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"^=\"");
                  }
                }
                if (r10 === null) {
                  if (input.substr(pos, 2) === "$=") {
                    r10 = "$=";
                    pos += 2;
                  } else {
                    r10 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"$=\"");
                    }
                  }
                  if (r10 === null) {
                    if (input.substr(pos, 2) === "*=") {
                      r10 = "*=";
                      pos += 2;
                    } else {
                      r10 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"*=\"");
                      }
                    }
                    if (r10 === null) {
                      if (input.substr(pos, 2) === "~=") {
                        r10 = "~=";
                        pos += 2;
                      } else {
                        r10 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"~=\"");
                        }
                      }
                      if (r10 === null) {
                        if (input.substr(pos, 2) === "|=") {
                          r10 = "|=";
                          pos += 2;
                        } else {
                          r10 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"|=\"");
                          }
                        }
                        if (r10 === null) {
                          if (input.charCodeAt(pos) === 61) {
                            r10 = "=";
                            pos++;
                          } else {
                            r10 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"=\"");
                            }
                          }
                        }
                      }
                    }
                  }
                }
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_list();
                    if (r12 !== null) {
                      r6 = [r9, r10, r11, r12];
                    } else {
                      r6 = null;
                      pos = r8;
                    }
                  } else {
                    r6 = null;
                    pos = r8;
                  }
                } else {
                  r6 = null;
                  pos = r8;
                }
              } else {
                r6 = null;
                pos = r8;
              }
              if (r6 !== null) {
                reportedPos = r7;
                r6 = (function(o, l) {return [o, l]})(r10, r12);
              }
              if (r6 === null) {
                pos = r7;
              }
              r6 = r6 !== null ? r6 : "";
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 93) {
                    r8 = "]";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"]\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, rest) {
        		if (rest) rest.unshift(name)
        		else rest = [name]
        		return N('attributeSelector', rest)
        	})(r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_negationSelector() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4).toLowerCase() === ":not") {
          r3 = input.substr(pos, 4);
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\":not\"");
          }
        }
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 40) {
            r4 = "(";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"(\"");
            }
          }
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_negationArgument();
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r8 = ")";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(argument) {
        		return N('negationSelector', [argument])
        	})(r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_negationArgument() {
        var r0;
        
        r0 = parse_classSelector();
        if (r0 === null) {
          r0 = parse_typeSelector();
          if (r0 === null) {
            r0 = parse_attributeSelector();
            if (r0 === null) {
              r0 = parse_pseudoSelector();
              if (r0 === null) {
                r0 = parse_hashSelector();
                if (r0 === null) {
                  r0 = parse_universalSelector();
                }
              }
            }
          }
        }
        return r0;
      }
      
      function parse_pseudoSelector() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 58) {
          r3 = ":";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\":\"");
          }
        }
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 58) {
            r4 = ":";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\":\"");
            }
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r5 = parse_pseudoFunction();
            if (r5 === null) {
              r5 = parse_identifier();
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(doubled, value) {
        		return N('pseudoSelector', [value], {doubled: !!doubled})
        	})(r4, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_pseudoFunction() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rawIdentifier();
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 40) {
            r4 = "(";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"(\"");
            }
          }
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_pseudoArgument();
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r8 = ")";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, argument) {
        		return N('function', [name, argument])
        	})(r3, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_pseudoArgument() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_pseudoElement();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            r9 = parse_pseudoElement();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(a) {return a})(r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_pseudoElement();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(a) {return a})(r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('pseudoArgument', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_pseudoElement() {
        var r0;
        
        if (/^[\-+]/.test(input.charAt(pos))) {
          r0 = input.charAt(pos);
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\-+]");
          }
        }
        if (r0 === null) {
          r0 = parse_dimension();
          if (r0 === null) {
            r0 = parse_number();
            if (r0 === null) {
              r0 = parse_string();
              if (r0 === null) {
                r0 = parse_identifier();
              }
            }
          }
        }
        return r0;
      }
      
      function parse_ruleList() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_rules();
            r5 = r5 !== null ? r5 : "";
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 125) {
                  r7 = "}";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"}\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(rules) {
        		return N('ruleList', rules || [])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rules() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rule();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            r9 = parse_rule();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(r) {return r})(r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_rule();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(r) {return r})(r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return rest
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rule() {
        var r0;
        
        r0 = parse_ruleset();
        if (r0 === null) {
          r0 = parse_property();
          if (r0 === null) {
            r0 = parse_assignment();
            if (r0 === null) {
              r0 = parse_extend();
              if (r0 === null) {
                r0 = parse_media();
                if (r0 === null) {
                  r0 = parse_void();
                  if (r0 === null) {
                    r0 = parse_block();
                    if (r0 === null) {
                      r0 = parse_import();
                      if (r0 === null) {
                        r0 = parse_if();
                        if (r0 === null) {
                          r0 = parse_for();
                          if (r0 === null) {
                            r0 = parse_mixinCall();
                            if (r0 === null) {
                              r0 = parse_keyframes();
                              if (r0 === null) {
                                r0 = parse_fontFace();
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return r0;
      }
      
      function parse_property() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 42) {
          r3 = "*";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"*\"");
          }
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse_identifier();
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              if (input.charCodeAt(pos) === 58) {
                r6 = ":";
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("\":\"");
                }
              }
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  r8 = parse_list();
                  if (r8 !== null) {
                    r9 = parse__();
                    if (r9 !== null) {
                      if (input.substr(pos, 10) === "!important") {
                        r10 = "!important";
                        pos += 10;
                      } else {
                        r10 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"!important\"");
                        }
                      }
                      r10 = r10 !== null ? r10 : "";
                      if (r10 !== null) {
                        r11 = parse__();
                        if (r11 !== null) {
                          r12 = parse_semicolon();
                          if (r12 !== null) {
                            r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12];
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(star, name, value, priority) {
        		if (star) {
        			if (name.type === 'identifier')
        				name.children.unshift(star)
        			else
        				name = N('identifier', [star, name])
        		}
        		return N('property', [name, value, priority || null])
        	})(r3, r4, r8, r10);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_semicolon() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        reportFailures++;
        if (input.charCodeAt(pos) === 125) {
          r0 = "}";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"}\"");
          }
        }
        reportFailures--;
        if (r0 !== null) {
          r0 = "";
          pos = r1;
        } else {
          r0 = null;
        }
        if (r0 === null) {
          r1 = pos;
          if (input.charCodeAt(pos) === 59) {
            r2 = ";";
            pos++;
          } else {
            r2 = null;
            if (reportFailures === 0) {
              matchFailed("\";\"");
            }
          }
          if (r2 !== null) {
            r3 = [];
            r5 = pos;
            r6 = parse__();
            if (r6 !== null) {
              if (input.charCodeAt(pos) === 59) {
                r7 = ";";
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("\";\"");
                }
              }
              if (r7 !== null) {
                r4 = [r6, r7];
              } else {
                r4 = null;
                pos = r5;
              }
            } else {
              r4 = null;
              pos = r5;
            }
            while (r4 !== null) {
              r3.push(r4);
              r5 = pos;
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 59) {
                  r7 = ";";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\";\"");
                  }
                }
                if (r7 !== null) {
                  r4 = [r6, r7];
                } else {
                  r4 = null;
                  pos = r5;
                }
              } else {
                r4 = null;
                pos = r5;
              }
            }
            if (r3 !== null) {
              r0 = [r2, r3];
            } else {
              r0 = null;
              pos = r1;
            }
          } else {
            r0 = null;
            pos = r1;
          }
        }
        return r0;
      }
      
      function parse_list() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_logicalOrExpression();
        if (r3 !== null) {
          r6 = pos;
          r7 = parse_separator();
          if (r7 !== null) {
            r8 = parse_logicalOrExpression();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              r7 = parse_separator();
              if (r7 !== null) {
                r8 = parse_logicalOrExpression();
                if (r8 !== null) {
                  r5 = [r7, r8];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest = _.flatten(rest)
        		rest.unshift(first)
        		return N('list', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_logicalOrExpression();
        }
        return r0;
      }
      
      function parse_separator() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse__();
        if (r3 !== null) {
          r4 = parse_commaSeparator();
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(commaSeparator) {
        		return commaSeparator
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_nonCommaSeparator();
        }
        return r0;
      }
      
      function parse_commaSeparator() {
        var r0, r1;
        
        r1 = pos;
        if (input.charCodeAt(pos) === 44) {
          r0 = ",";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\",\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('separator', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_nonCommaSeparator() {
        var r0, r1, r2;
        
        r1 = pos;
        if (input.charCodeAt(pos) === 47) {
          r0 = "/";
          pos++;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"/\"");
          }
        }
        if (r0 === null) {
          r2 = pos;
          r0 = parse_s();
          if (r0 !== null) {
            reportedPos = r2;
            r0 = (function() {return ' '})();
          }
          if (r0 === null) {
            pos = r2;
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('separator', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_nonCommaList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_logicalOrExpression();
        if (r3 !== null) {
          r6 = pos;
          r7 = parse_nonCommaSeparator();
          if (r7 !== null) {
            r8 = parse_logicalOrExpression();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          if (r5 !== null) {
            r4 = [];
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              r7 = parse_nonCommaSeparator();
              if (r7 !== null) {
                r8 = parse_logicalOrExpression();
                if (r8 !== null) {
                  r5 = [r7, r8];
                } else {
                  r5 = null;
                  pos = r6;
                }
              } else {
                r5 = null;
                pos = r6;
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest = _.flatten(rest)
        		rest.unshift(first)
        		return N('list', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_logicalOrExpression();
        }
        return r0;
      }
      
      function parse_logicalOrExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_logicalAndExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.substr(pos, 2).toLowerCase() === "or") {
              r9 = input.substr(pos, 2);
              pos += 2;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\"or\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_logicalAndExpression();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(e) {return e})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.substr(pos, 2).toLowerCase() === "or") {
                r9 = input.substr(pos, 2);
                pos += 2;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"or\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_logicalAndExpression();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(e) {return e})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(operand) {
        			node = N('logicalExpression', [node, 'or', operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_logicalAndExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_equalityExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.substr(pos, 3).toLowerCase() === "and") {
              r9 = input.substr(pos, 3);
              pos += 3;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\"and\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_equalityExpression();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(e) {return e})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.substr(pos, 3).toLowerCase() === "and") {
                r9 = input.substr(pos, 3);
                pos += 3;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"and\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_equalityExpression();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(e) {return e})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(operand) {
        			node = N('logicalExpression', [node, 'and', operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_equalityExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_relationalExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r8 = pos;
          r9 = pos;
          r10 = parse__();
          if (r10 !== null) {
            if (input.substr(pos, 4).toLowerCase() === "isnt") {
              r11 = input.substr(pos, 4);
              pos += 4;
            } else {
              r11 = null;
              if (reportFailures === 0) {
                matchFailed("\"isnt\"");
              }
            }
            if (r11 === null) {
              if (input.substr(pos, 2).toLowerCase() === "is") {
                r11 = input.substr(pos, 2);
                pos += 2;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("\"is\"");
                }
              }
            }
            if (r11 !== null) {
              r12 = parse__();
              if (r12 !== null) {
                r7 = [r10, r11, r12];
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
          } else {
            r7 = null;
            pos = r9;
          }
          if (r7 !== null) {
            reportedPos = r8;
            r7 = (function(o) {return o})(r11);
          }
          if (r7 === null) {
            pos = r8;
          }
          if (r7 !== null) {
            r8 = parse_relationalExpression();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r8 = pos;
            r9 = pos;
            r10 = parse__();
            if (r10 !== null) {
              if (input.substr(pos, 4).toLowerCase() === "isnt") {
                r11 = input.substr(pos, 4);
                pos += 4;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("\"isnt\"");
                }
              }
              if (r11 === null) {
                if (input.substr(pos, 2).toLowerCase() === "is") {
                  r11 = input.substr(pos, 2);
                  pos += 2;
                } else {
                  r11 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"is\"");
                  }
                }
              }
              if (r11 !== null) {
                r12 = parse__();
                if (r12 !== null) {
                  r7 = [r10, r11, r12];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(o) {return o})(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 !== null) {
              r8 = parse_relationalExpression();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(array) {
        			var operator = array[0]
        			var operand = array[1]
        			node = N('equalityExpression', [node, operator, operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_relationalExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_range();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r8 = pos;
          r9 = pos;
          r10 = parse__();
          if (r10 !== null) {
            r12 = pos;
            r13 = pos;
            if (/^[<>]/.test(input.charAt(pos))) {
              r14 = input.charAt(pos);
              pos++;
            } else {
              r14 = null;
              if (reportFailures === 0) {
                matchFailed("[<>]");
              }
            }
            if (r14 !== null) {
              if (input.charCodeAt(pos) === 61) {
                r15 = "=";
                pos++;
              } else {
                r15 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              r15 = r15 !== null ? r15 : "";
              if (r15 !== null) {
                r11 = [r14, r15];
              } else {
                r11 = null;
                pos = r13;
              }
            } else {
              r11 = null;
              pos = r13;
            }
            if (r11 !== null) {
              r11 = input.substring(pos, r12);
            }
            if (r11 !== null) {
              r12 = parse__();
              if (r12 !== null) {
                r7 = [r10, r11, r12];
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
          } else {
            r7 = null;
            pos = r9;
          }
          if (r7 !== null) {
            reportedPos = r8;
            r7 = (function(o) {return o})(r11);
          }
          if (r7 === null) {
            pos = r8;
          }
          if (r7 !== null) {
            r8 = parse_range();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r8 = pos;
            r9 = pos;
            r10 = parse__();
            if (r10 !== null) {
              r12 = pos;
              r13 = pos;
              if (/^[<>]/.test(input.charAt(pos))) {
                r14 = input.charAt(pos);
                pos++;
              } else {
                r14 = null;
                if (reportFailures === 0) {
                  matchFailed("[<>]");
                }
              }
              if (r14 !== null) {
                if (input.charCodeAt(pos) === 61) {
                  r15 = "=";
                  pos++;
                } else {
                  r15 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"=\"");
                  }
                }
                r15 = r15 !== null ? r15 : "";
                if (r15 !== null) {
                  r11 = [r14, r15];
                } else {
                  r11 = null;
                  pos = r13;
                }
              } else {
                r11 = null;
                pos = r13;
              }
              if (r11 !== null) {
                r11 = input.substring(pos, r12);
              }
              if (r11 !== null) {
                r12 = parse__();
                if (r12 !== null) {
                  r7 = [r10, r11, r12];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(o) {return o})(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 !== null) {
              r8 = parse_range();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(array) {
        			var operator = array[0]
        			var operand = array[1]
        			node = N('relationalExpression', [node, operator, operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_range() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_additiveExpression();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r6 = pos;
            r7 = pos;
            if (input.substr(pos, 2) === "..") {
              r8 = "..";
              pos += 2;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"..\"");
              }
            }
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 46) {
                r9 = ".";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\".\"");
                }
              }
              r9 = r9 !== null ? r9 : "";
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              r5 = input.substring(pos, r6);
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_additiveExpression();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(from, operator, to) {
        		return N('range', [from, operator, to])
        	})(r3, r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_additiveExpression();
        }
        return r0;
      }
      
      function parse_additiveExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_multiplicativeExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r8 = pos;
          r9 = pos;
          r10 = parse__();
          if (r10 !== null) {
            if (/^[\-+]/.test(input.charAt(pos))) {
              r11 = input.charAt(pos);
              pos++;
            } else {
              r11 = null;
              if (reportFailures === 0) {
                matchFailed("[\\-+]");
              }
            }
            if (r11 !== null) {
              r12 = parse_s();
              if (r12 !== null) {
                r7 = [r10, r11, r12];
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
          } else {
            r7 = null;
            pos = r9;
          }
          if (r7 !== null) {
            reportedPos = r8;
            r7 = (function(c) {return c})(r11);
          }
          if (r7 === null) {
            pos = r8;
          }
          if (r7 === null) {
            if (/^[\-+]/.test(input.charAt(pos))) {
              r7 = input.charAt(pos);
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("[\\-+]");
              }
            }
          }
          if (r7 !== null) {
            r8 = parse_multiplicativeExpression();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r8 = pos;
            r9 = pos;
            r10 = parse__();
            if (r10 !== null) {
              if (/^[\-+]/.test(input.charAt(pos))) {
                r11 = input.charAt(pos);
                pos++;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\-+]");
                }
              }
              if (r11 !== null) {
                r12 = parse_s();
                if (r12 !== null) {
                  r7 = [r10, r11, r12];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(c) {return c})(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 === null) {
              if (/^[\-+]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\-+]");
                }
              }
            }
            if (r7 !== null) {
              r8 = parse_multiplicativeExpression();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(array) {
        			var operator = array[0]
        			var operand = array[1]
        			node = N('arithmeticExpression', [node, operator, operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_multiplicativeExpression() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_unaryExpression();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r8 = pos;
          r9 = pos;
          r10 = parse__();
          if (r10 !== null) {
            if (input.charCodeAt(pos) === 47) {
              r11 = "/";
              pos++;
            } else {
              r11 = null;
              if (reportFailures === 0) {
                matchFailed("\"/\"");
              }
            }
            if (r11 !== null) {
              r12 = parse_s();
              if (r12 !== null) {
                r7 = [r10, r11, r12];
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
          } else {
            r7 = null;
            pos = r9;
          }
          if (r7 !== null) {
            reportedPos = r8;
            r7 = (function(c) {return c})(r11);
          }
          if (r7 === null) {
            pos = r8;
          }
          if (r7 === null) {
            r8 = pos;
            r9 = pos;
            r10 = parse_s();
            if (r10 !== null) {
              if (input.charCodeAt(pos) === 47) {
                r11 = "/";
                pos++;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("\"/\"");
                }
              }
              if (r11 !== null) {
                r12 = parse__();
                if (r12 !== null) {
                  r7 = [r10, r11, r12];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(c) {return c})(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 === null) {
              r8 = pos;
              r9 = pos;
              r10 = parse__();
              if (r10 !== null) {
                if (input.charCodeAt(pos) === 42) {
                  r11 = "*";
                  pos++;
                } else {
                  r11 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"*\"");
                  }
                }
                if (r11 !== null) {
                  r12 = parse__();
                  if (r12 !== null) {
                    r7 = [r10, r11, r12];
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
              if (r7 !== null) {
                reportedPos = r8;
                r7 = (function(c) {return c})(r11);
              }
              if (r7 === null) {
                pos = r8;
              }
            }
          }
          if (r7 !== null) {
            r8 = parse_unaryExpression();
            if (r8 !== null) {
              r5 = [r7, r8];
            } else {
              r5 = null;
              pos = r6;
            }
          } else {
            r5 = null;
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r8 = pos;
            r9 = pos;
            r10 = parse__();
            if (r10 !== null) {
              if (input.charCodeAt(pos) === 47) {
                r11 = "/";
                pos++;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("\"/\"");
                }
              }
              if (r11 !== null) {
                r12 = parse_s();
                if (r12 !== null) {
                  r7 = [r10, r11, r12];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
            } else {
              r7 = null;
              pos = r9;
            }
            if (r7 !== null) {
              reportedPos = r8;
              r7 = (function(c) {return c})(r11);
            }
            if (r7 === null) {
              pos = r8;
            }
            if (r7 === null) {
              r8 = pos;
              r9 = pos;
              r10 = parse_s();
              if (r10 !== null) {
                if (input.charCodeAt(pos) === 47) {
                  r11 = "/";
                  pos++;
                } else {
                  r11 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"/\"");
                  }
                }
                if (r11 !== null) {
                  r12 = parse__();
                  if (r12 !== null) {
                    r7 = [r10, r11, r12];
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
              if (r7 !== null) {
                reportedPos = r8;
                r7 = (function(c) {return c})(r11);
              }
              if (r7 === null) {
                pos = r8;
              }
              if (r7 === null) {
                r8 = pos;
                r9 = pos;
                r10 = parse__();
                if (r10 !== null) {
                  if (input.charCodeAt(pos) === 42) {
                    r11 = "*";
                    pos++;
                  } else {
                    r11 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"*\"");
                    }
                  }
                  if (r11 !== null) {
                    r12 = parse__();
                    if (r12 !== null) {
                      r7 = [r10, r11, r12];
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(c) {return c})(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
              }
            }
            if (r7 !== null) {
              r8 = parse_unaryExpression();
              if (r8 !== null) {
                r5 = [r7, r8];
              } else {
                r5 = null;
                pos = r6;
              }
            } else {
              r5 = null;
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		var node = first
        		rest.forEach(function(array) {
        			var operator = array[0]
        			var operand = array[1]
        			node = N('arithmeticExpression', [node, operator, operand])
        		})
        		return node
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_unaryExpression();
        }
        return r0;
      }
      
      function parse_unaryExpression() {
        var r0, r1, r2, r3, r4;
        
        r0 = parse_primary();
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (/^[\-+]/.test(input.charAt(pos))) {
            r3 = input.charAt(pos);
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("[\\-+]");
            }
          }
          if (r3 !== null) {
            r4 = parse_unaryExpression();
            if (r4 !== null) {
              r0 = [r3, r4];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(operator, operand) {
          		return N('unaryExpression', [operator, operand])
          	})(r3, r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        return r0;
      }
      
      function parse_primary() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 40) {
          r3 = "(";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"(\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_list();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 41) {
                  r7 = ")";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\")\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(list) {
        		return list
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r0 = parse_variable();
          if (r0 === null) {
            r0 = parse_percentage();
            if (r0 === null) {
              r0 = parse_dimension();
              if (r0 === null) {
                r0 = parse_number();
                if (r0 === null) {
                  r0 = parse_color();
                  if (r0 === null) {
                    r0 = parse_url();
                    if (r0 === null) {
                      r0 = parse_function();
                      if (r0 === null) {
                        r0 = parse_boolean();
                        if (r0 === null) {
                          r0 = parse_null();
                          if (r0 === null) {
                            r0 = parse_identifier();
                            if (r0 === null) {
                              r0 = parse_string();
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return r0;
      }
      
      function parse_identifier() {
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = parse_rawIdentifier();
        if (r2 === null) {
          r3 = pos;
          r4 = pos;
          if (input.charCodeAt(pos) === 45) {
            r5 = "-";
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("\"-\"");
            }
          }
          r5 = r5 !== null ? r5 : "";
          if (r5 !== null) {
            r6 = parse_variable();
            if (r6 === null) {
              r6 = parse_interpolation();
            }
            if (r6 !== null) {
              r2 = [r5, r6];
            } else {
              r2 = null;
              pos = r4;
            }
          } else {
            r2 = null;
            pos = r4;
          }
          if (r2 !== null) {
            reportedPos = r3;
            r2 = (function(d, v) {return d ? [d,v] : v})(r5, r6);
          }
          if (r2 === null) {
            pos = r3;
          }
        }
        if (r2 !== null) {
          r0 = [];
          while (r2 !== null) {
            r0.push(r2);
            r2 = parse_rawIdentifier();
            if (r2 === null) {
              r3 = pos;
              r4 = pos;
              if (input.charCodeAt(pos) === 45) {
                r5 = "-";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"-\"");
                }
              }
              r5 = r5 !== null ? r5 : "";
              if (r5 !== null) {
                r6 = parse_variable();
                if (r6 === null) {
                  r6 = parse_interpolation();
                }
                if (r6 !== null) {
                  r2 = [r5, r6];
                } else {
                  r2 = null;
                  pos = r4;
                }
              } else {
                r2 = null;
                pos = r4;
              }
              if (r2 !== null) {
                reportedPos = r3;
                r2 = (function(d, v) {return d ? [d,v] : v})(r5, r6);
              }
              if (r2 === null) {
                pos = r3;
              }
            }
          }
        } else {
          r0 = null;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(values) {
        		values = _.flatten(values)
        		if (values.length === 1 && typeof values[0] !== 'string')
        			return values[0]
        
        		return N('identifier', values)
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rawIdentifier() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = pos;
        if (input.charCodeAt(pos) === 45) {
          r4 = "-";
          pos++;
        } else {
          r4 = null;
          if (reportFailures === 0) {
            matchFailed("\"-\"");
          }
        }
        r4 = r4 !== null ? r4 : "";
        if (r4 !== null) {
          if (/^[_a-z]/i.test(input.charAt(pos))) {
            r5 = input.charAt(pos);
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("[_a-z]i");
            }
          }
          if (r5 !== null) {
            r6 = [];
            if (/^[\-_a-z0-9]/i.test(input.charAt(pos))) {
              r7 = input.charAt(pos);
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("[\\-_a-z0-9]i");
              }
            }
            while (r7 !== null) {
              r6.push(r7);
              if (/^[\-_a-z0-9]/i.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[\\-_a-z0-9]i");
                }
              }
            }
            if (r6 !== null) {
              r0 = [r4, r5, r6];
            } else {
              r0 = null;
              pos = r3;
            }
          } else {
            r0 = null;
            pos = r3;
          }
        } else {
          r0 = null;
          pos = r3;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r2);
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return value
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_interpolation() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_variable();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 125) {
                  r7 = "}";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"}\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(variable) {
        		return variable
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_variable() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 36) {
          r3 = "$";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"$\"");
          }
        }
        if (r3 !== null) {
          r4 = parse_rawIdentifier();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('variable', [value])
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_string() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 39) {
          r3 = "'";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"'\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r4 = [];
          if (/^[^\n\r\f\\']/.test(input.charAt(pos))) {
            r6 = input.charAt(pos);
            pos++;
          } else {
            r6 = null;
            if (reportFailures === 0) {
              matchFailed("[^\\n\\r\\f\\\\']");
            }
          }
          if (r6 === null) {
            r7 = pos;
            if (input.charCodeAt(pos) === 92) {
              r8 = "\\";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\\\"");
              }
            }
            if (r8 !== null) {
              if (input.length > pos) {
                r9 = input.charAt(pos);
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("any character");
                }
              }
              if (r9 !== null) {
                r6 = [r8, r9];
              } else {
                r6 = null;
                pos = r7;
              }
            } else {
              r6 = null;
              pos = r7;
            }
          }
          while (r6 !== null) {
            r4.push(r6);
            if (/^[^\n\r\f\\']/.test(input.charAt(pos))) {
              r6 = input.charAt(pos);
              pos++;
            } else {
              r6 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\n\\r\\f\\\\']");
              }
            }
            if (r6 === null) {
              r7 = pos;
              if (input.charCodeAt(pos) === 92) {
                r8 = "\\";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\\\"");
                }
              }
              if (r8 !== null) {
                if (input.length > pos) {
                  r9 = input.charAt(pos);
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("any character");
                  }
                }
                if (r9 !== null) {
                  r6 = [r8, r9];
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            }
          }
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            if (input.charCodeAt(pos) === 39) {
              r5 = "'";
              pos++;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"'\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('string', [value], {quote: "'"})
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          r2 = pos;
          if (input.charCodeAt(pos) === 34) {
            r3 = "\"";
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\"\"");
            }
          }
          if (r3 !== null) {
            r4 = [];
            r6 = pos;
            if (/^[^\n\r\f\\"{$]/.test(input.charAt(pos))) {
              r7 = input.charAt(pos);
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\n\\r\\f\\\\\"{$]");
              }
            }
            if (r7 === null) {
              r8 = pos;
              if (input.charCodeAt(pos) === 92) {
                r9 = "\\";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\\\"");
                }
              }
              if (r9 !== null) {
                if (input.length > pos) {
                  r10 = input.charAt(pos);
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("any character");
                  }
                }
                if (r10 !== null) {
                  r7 = [r9, r10];
                } else {
                  r7 = null;
                  pos = r8;
                }
              } else {
                r7 = null;
                pos = r8;
              }
            }
            if (r7 !== null) {
              r5 = [];
              while (r7 !== null) {
                r5.push(r7);
                if (/^[^\n\r\f\\"{$]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\\n\\r\\f\\\\\"{$]");
                  }
                }
                if (r7 === null) {
                  r8 = pos;
                  if (input.charCodeAt(pos) === 92) {
                    r9 = "\\";
                    pos++;
                  } else {
                    r9 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"\\\\\"");
                    }
                  }
                  if (r9 !== null) {
                    if (input.length > pos) {
                      r10 = input.charAt(pos);
                      pos++;
                    } else {
                      r10 = null;
                      if (reportFailures === 0) {
                        matchFailed("any character");
                      }
                    }
                    if (r10 !== null) {
                      r7 = [r9, r10];
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                }
              }
            } else {
              r5 = null;
            }
            if (r5 !== null) {
              r5 = input.substring(pos, r6);
            }
            if (r5 === null) {
              r5 = parse_variable();
              if (r5 === null) {
                r5 = parse_interpolation();
                if (r5 === null) {
                  if (input.charCodeAt(pos) === 123) {
                    r5 = "{";
                    pos++;
                  } else {
                    r5 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"{\"");
                    }
                  }
                }
              }
            }
            while (r5 !== null) {
              r4.push(r5);
              r6 = pos;
              if (/^[^\n\r\f\\"{$]/.test(input.charAt(pos))) {
                r7 = input.charAt(pos);
                pos++;
              } else {
                r7 = null;
                if (reportFailures === 0) {
                  matchFailed("[^\\n\\r\\f\\\\\"{$]");
                }
              }
              if (r7 === null) {
                r8 = pos;
                if (input.charCodeAt(pos) === 92) {
                  r9 = "\\";
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\\\"");
                  }
                }
                if (r9 !== null) {
                  if (input.length > pos) {
                    r10 = input.charAt(pos);
                    pos++;
                  } else {
                    r10 = null;
                    if (reportFailures === 0) {
                      matchFailed("any character");
                    }
                  }
                  if (r10 !== null) {
                    r7 = [r9, r10];
                  } else {
                    r7 = null;
                    pos = r8;
                  }
                } else {
                  r7 = null;
                  pos = r8;
                }
              }
              if (r7 !== null) {
                r5 = [];
                while (r7 !== null) {
                  r5.push(r7);
                  if (/^[^\n\r\f\\"{$]/.test(input.charAt(pos))) {
                    r7 = input.charAt(pos);
                    pos++;
                  } else {
                    r7 = null;
                    if (reportFailures === 0) {
                      matchFailed("[^\\n\\r\\f\\\\\"{$]");
                    }
                  }
                  if (r7 === null) {
                    r8 = pos;
                    if (input.charCodeAt(pos) === 92) {
                      r9 = "\\";
                      pos++;
                    } else {
                      r9 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"\\\\\"");
                      }
                    }
                    if (r9 !== null) {
                      if (input.length > pos) {
                        r10 = input.charAt(pos);
                        pos++;
                      } else {
                        r10 = null;
                        if (reportFailures === 0) {
                          matchFailed("any character");
                        }
                      }
                      if (r10 !== null) {
                        r7 = [r9, r10];
                      } else {
                        r7 = null;
                        pos = r8;
                      }
                    } else {
                      r7 = null;
                      pos = r8;
                    }
                  }
                }
              } else {
                r5 = null;
              }
              if (r5 !== null) {
                r5 = input.substring(pos, r6);
              }
              if (r5 === null) {
                r5 = parse_variable();
                if (r5 === null) {
                  r5 = parse_interpolation();
                  if (r5 === null) {
                    if (input.charCodeAt(pos) === 123) {
                      r5 = "{";
                      pos++;
                    } else {
                      r5 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"{\"");
                      }
                    }
                  }
                }
              }
            }
            if (r4 !== null) {
              if (input.charCodeAt(pos) === 34) {
                r5 = "\"";
                pos++;
              } else {
                r5 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (r5 !== null) {
                r0 = [r3, r4, r5];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function(values) {
          		if (!values.length) values.push('')
          		return N('string', values, {quote: '"'})
          	})(r4);
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        return r0;
      }
      
      function parse_percentage() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rawNumber();
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 37) {
            r4 = "%";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"%\"");
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('percentage', [value])
        	})(r3);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_dimension() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rawNumber();
        if (r3 !== null) {
          r4 = parse_rawIdentifier();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value, unit) {
        		return N('dimension', [value, unit])
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_number() {
        var r0, r1;
        
        r1 = pos;
        r0 = parse_rawNumber();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('number', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_rawNumber() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r3 = pos;
        r4 = [];
        if (/^[0-9]/.test(input.charAt(pos))) {
          r5 = input.charAt(pos);
          pos++;
        } else {
          r5 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9]");
          }
        }
        while (r5 !== null) {
          r4.push(r5);
          if (/^[0-9]/.test(input.charAt(pos))) {
            r5 = input.charAt(pos);
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9]");
            }
          }
        }
        if (r4 !== null) {
          if (input.charCodeAt(pos) === 46) {
            r5 = ".";
            pos++;
          } else {
            r5 = null;
            if (reportFailures === 0) {
              matchFailed("\".\"");
            }
          }
          if (r5 !== null) {
            if (/^[0-9]/.test(input.charAt(pos))) {
              r7 = input.charAt(pos);
              pos++;
            } else {
              r7 = null;
              if (reportFailures === 0) {
                matchFailed("[0-9]");
              }
            }
            if (r7 !== null) {
              r6 = [];
              while (r7 !== null) {
                r6.push(r7);
                if (/^[0-9]/.test(input.charAt(pos))) {
                  r7 = input.charAt(pos);
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("[0-9]");
                  }
                }
              }
            } else {
              r6 = null;
            }
            if (r6 !== null) {
              r0 = [r4, r5, r6];
            } else {
              r0 = null;
              pos = r3;
            }
          } else {
            r0 = null;
            pos = r3;
          }
        } else {
          r0 = null;
          pos = r3;
        }
        if (r0 === null) {
          if (/^[0-9]/.test(input.charAt(pos))) {
            r3 = input.charAt(pos);
            pos++;
          } else {
            r3 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9]");
            }
          }
          if (r3 !== null) {
            r0 = [];
            while (r3 !== null) {
              r0.push(r3);
              if (/^[0-9]/.test(input.charAt(pos))) {
                r3 = input.charAt(pos);
                pos++;
              } else {
                r3 = null;
                if (reportFailures === 0) {
                  matchFailed("[0-9]");
                }
              }
            }
          } else {
            r0 = null;
          }
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r2);
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return +value
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_color() {
        var r0, r1, r2, r3, r4, r5, r6;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 35) {
          r3 = "#";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"#\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          if (/^[0-9a-z]/i.test(input.charAt(pos))) {
            r6 = input.charAt(pos);
            pos++;
          } else {
            r6 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9a-z]i");
            }
          }
          if (r6 !== null) {
            r4 = [];
            while (r6 !== null) {
              r4.push(r6);
              if (/^[0-9a-z]/i.test(input.charAt(pos))) {
                r6 = input.charAt(pos);
                pos++;
              } else {
                r6 = null;
                if (reportFailures === 0) {
                  matchFailed("[0-9a-z]i");
                }
              }
            }
          } else {
            r4 = null;
          }
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(rgb) {
        		if (rgb.length !== 3 && rgb.length !== 6)
        			return
        
        		return N('color', [rgb])
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_function() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_rawIdentifier();
        if (r3 !== null) {
          if (input.charCodeAt(pos) === 40) {
            r4 = "(";
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"(\"");
            }
          }
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_argumentList();
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r8 = ")";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, argumentList) {
        		return N('function', [name, argumentList])
        	})(r3, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_argumentList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_nonCommaList();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r9 = ",";
              pos++;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_nonCommaList();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(s) {return s})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r9 = ",";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_nonCommaList();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(s) {return s})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('argumentList', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_boolean() {
        var r0, r1;
        
        r1 = pos;
        if (input.substr(pos, 4).toLowerCase() === "true") {
          r0 = input.substr(pos, 4);
          pos += 4;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"true\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() {
        		return N('boolean', [true])
        	})();
        }
        if (r0 === null) {
          pos = r1;
        }
        if (r0 === null) {
          r1 = pos;
          if (input.substr(pos, 5).toLowerCase() === "false") {
            r0 = input.substr(pos, 5);
            pos += 5;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("\"false\"");
            }
          }
          if (r0 !== null) {
            reportedPos = r1;
            r0 = (function() {
          		return N('boolean', [false])
          	})();
          }
          if (r0 === null) {
            pos = r1;
          }
        }
        return r0;
      }
      
      function parse_null() {
        var r0, r1;
        
        r1 = pos;
        if (input.substr(pos, 4).toLowerCase() === "null") {
          r0 = input.substr(pos, 4);
          pos += 4;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"null\"");
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function() {
        		return N('null')
        	})();
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_assignment() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_variable();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r6 = pos;
            r7 = pos;
            if (/^[\-+*\/?]/.test(input.charAt(pos))) {
              r8 = input.charAt(pos);
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("[\\-+*\\/?]");
              }
            }
            r8 = r8 !== null ? r8 : "";
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 61) {
                r9 = "=";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              r5 = input.substring(pos, r6);
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_mixin();
                if (r7 === null) {
                  r7 = parse_list();
                }
                if (r7 !== null) {
                  r8 = parse__();
                  if (r8 !== null) {
                    r9 = parse_semicolon();
                    if (r9 !== null) {
                      r0 = [r3, r4, r5, r6, r7, r8, r9];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, operator, value) {
        		return N('assignment', [name, operator, value])
        	})(r3, r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_media() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6).toLowerCase() === "@media") {
          r3 = input.substr(pos, 6);
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@media\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_mediaQueryList();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_ruleList();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(mediaQueryList, ruleList) {
        		return N('media', [mediaQueryList, ruleList])
        	})(r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mediaQueryList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_mediaQuery();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r9 = ",";
              pos++;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_mediaQuery();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(q) {return q})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r9 = ",";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_mediaQuery();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(q) {return q})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('mediaQueryList', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mediaQuery() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_mediaInterpolation();
        if (r3 === null) {
          r3 = parse_mediaType();
          if (r3 === null) {
            r3 = parse_mediaFeature();
          }
        }
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.substr(pos, 3).toLowerCase() === "and") {
              r9 = input.substr(pos, 3);
              pos += 3;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\"and\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_mediaInterpolation();
                if (r11 === null) {
                  r11 = parse_mediaFeature();
                }
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(m) {return m})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.substr(pos, 3).toLowerCase() === "and") {
                r9 = input.substr(pos, 3);
                pos += 3;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"and\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_mediaInterpolation();
                  if (r11 === null) {
                    r11 = parse_mediaFeature();
                  }
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(m) {return m})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('mediaQuery', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mediaInterpolation() {
        var r0, r1;
        
        r1 = pos;
        r0 = parse_variable();
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('mediaInterpolation', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mediaType() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        r4 = pos;
        r5 = pos;
        if (input.substr(pos, 4).toLowerCase() === "only") {
          r6 = input.substr(pos, 4);
          pos += 4;
        } else {
          r6 = null;
          if (reportFailures === 0) {
            matchFailed("\"only\"");
          }
        }
        if (r6 === null) {
          if (input.substr(pos, 3).toLowerCase() === "not") {
            r6 = input.substr(pos, 3);
            pos += 3;
          } else {
            r6 = null;
            if (reportFailures === 0) {
              matchFailed("\"not\"");
            }
          }
        }
        if (r6 !== null) {
          r7 = parse__();
          if (r7 !== null) {
            r3 = [r6, r7];
          } else {
            r3 = null;
            pos = r5;
          }
        } else {
          r3 = null;
          pos = r5;
        }
        if (r3 !== null) {
          reportedPos = r4;
          r3 = (function(m) {return m})(r6);
        }
        if (r3 === null) {
          pos = r4;
        }
        r3 = r3 !== null ? r3 : "";
        if (r3 !== null) {
          r4 = parse_identifier();
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(modifier, value) {
        		return N('mediaType', [modifier || null, value])
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mediaFeature() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 40) {
          r3 = "(";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"(\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_identifier();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                if (input.charCodeAt(pos) === 58) {
                  r10 = ":";
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\":\"");
                  }
                }
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_list();
                    if (r12 !== null) {
                      r13 = parse__();
                      if (r13 !== null) {
                        r7 = [r10, r11, r12, r13];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(v) {return v})(r12);
                }
                if (r7 === null) {
                  pos = r8;
                }
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r8 = ")";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, value) {
        		return N('mediaFeature', [name, value || null])
        	})(r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_extend() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 7).toLowerCase() === "@extend") {
          r3 = input.substr(pos, 7);
          pos += 7;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@extend\"");
          }
        }
        if (r3 !== null) {
          if (input.substr(pos, 4).toLowerCase() === "-all") {
            r4 = input.substr(pos, 4);
            pos += 4;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("\"-all\"");
            }
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_selectorList();
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  r8 = parse_semicolon();
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(all, selectorList) {
        		return N('extend', [selectorList], {all: !!all})
        	})(r4, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_void() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5).toLowerCase() === "@void") {
          r3 = input.substr(pos, 5);
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@void\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_ruleList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(ruleList) {
        		return N('void', [ruleList])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_block() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6).toLowerCase() === "@block") {
          r3 = input.substr(pos, 6);
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@block\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_ruleList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(ruleList) {
        		return N('block', [ruleList])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_import() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 7).toLowerCase() === "@import") {
          r3 = input.substr(pos, 7);
          pos += 7;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@import\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_string();
            if (r5 === null) {
              r5 = parse_url();
              if (r5 === null) {
                r5 = parse_variable();
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                r10 = parse_mediaQueryList();
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r7 = [r10, r11];
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(m) {return m})(r10);
                }
                if (r7 === null) {
                  pos = r8;
                }
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  r8 = parse_semicolon();
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value, mediaQueryList) {
        		return N('import', [value, mediaQueryList || null])
        	})(r5, r7);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_url() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4).toLowerCase() === "url(") {
          r3 = input.substr(pos, 4);
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"url(\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_string();
            if (r5 === null) {
              r5 = parse_urlAddr();
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 41) {
                  r7 = ")";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\")\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('url', [value])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_urlAddr() {
        var r0, r1, r2, r3;
        
        r1 = pos;
        r2 = pos;
        if (/^[!#$%&*-~]/.test(input.charAt(pos))) {
          r3 = input.charAt(pos);
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("[!#$%&*-~]");
          }
        }
        if (r3 !== null) {
          r0 = [];
          while (r3 !== null) {
            r0.push(r3);
            if (/^[!#$%&*-~]/.test(input.charAt(pos))) {
              r3 = input.charAt(pos);
              pos++;
            } else {
              r3 = null;
              if (reportFailures === 0) {
                matchFailed("[!#$%&*-~]");
              }
            }
          }
        } else {
          r0 = null;
        }
        if (r0 !== null) {
          r0 = input.substring(pos, r2);
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return value
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_if() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 3).toLowerCase() === "@if") {
          r3 = input.substr(pos, 3);
          pos += 3;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@if\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_list();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_ruleList();
                if (r7 !== null) {
                  r9 = pos;
                  r10 = pos;
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_elseIf();
                    if (r12 === null) {
                      r12 = parse_else();
                    }
                    if (r12 !== null) {
                      r8 = [r11, r12];
                    } else {
                      r8 = null;
                      pos = r10;
                    }
                  } else {
                    r8 = null;
                    pos = r10;
                  }
                  if (r8 !== null) {
                    reportedPos = r9;
                    r8 = (function(e) {return e})(r12);
                  }
                  if (r8 === null) {
                    pos = r9;
                  }
                  r8 = r8 !== null ? r8 : "";
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(condition, consequence, alternative) {
        		return N('if', [condition, consequence, alternative || null])
        	})(r5, r7, r8);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_elseIf() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5).toLowerCase() === "@else") {
          r3 = input.substr(pos, 5);
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@else\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            if (input.substr(pos, 2).toLowerCase() === "if") {
              r5 = input.substr(pos, 2);
              pos += 2;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"if\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_list();
                if (r7 !== null) {
                  r8 = parse__();
                  if (r8 !== null) {
                    r9 = parse_ruleList();
                    if (r9 !== null) {
                      r11 = pos;
                      r12 = pos;
                      r13 = parse__();
                      if (r13 !== null) {
                        r14 = parse_elseIf();
                        if (r14 === null) {
                          r14 = parse_else();
                        }
                        if (r14 !== null) {
                          r10 = [r13, r14];
                        } else {
                          r10 = null;
                          pos = r12;
                        }
                      } else {
                        r10 = null;
                        pos = r12;
                      }
                      if (r10 !== null) {
                        reportedPos = r11;
                        r10 = (function(e) {return e})(r14);
                      }
                      if (r10 === null) {
                        pos = r11;
                      }
                      r10 = r10 !== null ? r10 : "";
                      if (r10 !== null) {
                        r0 = [r3, r4, r5, r6, r7, r8, r9, r10];
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(condition, consequence, alternative) {
        		return N('if', [condition, consequence, alternative || null])
        	})(r7, r9, r10);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_else() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 5).toLowerCase() === "@else") {
          r3 = input.substr(pos, 5);
          pos += 5;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@else\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_ruleList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(ruleList) {
        		return ruleList
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_for() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 4).toLowerCase() === "@for") {
          r3 = input.substr(pos, 4);
          pos += 4;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@for\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_variable();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r8 = pos;
                r9 = pos;
                if (input.charCodeAt(pos) === 44) {
                  r10 = ",";
                  pos++;
                } else {
                  r10 = null;
                  if (reportFailures === 0) {
                    matchFailed("\",\"");
                  }
                }
                if (r10 !== null) {
                  r11 = parse__();
                  if (r11 !== null) {
                    r12 = parse_variable();
                    if (r12 !== null) {
                      r13 = parse__();
                      if (r13 !== null) {
                        r7 = [r10, r11, r12, r13];
                      } else {
                        r7 = null;
                        pos = r9;
                      }
                    } else {
                      r7 = null;
                      pos = r9;
                    }
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(i) {return i})(r12);
                }
                if (r7 === null) {
                  pos = r8;
                }
                r7 = r7 !== null ? r7 : "";
                if (r7 !== null) {
                  r9 = pos;
                  r10 = pos;
                  if (input.substr(pos, 2).toLowerCase() === "by") {
                    r11 = input.substr(pos, 2);
                    pos += 2;
                  } else {
                    r11 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"by\"");
                    }
                  }
                  if (r11 !== null) {
                    r12 = parse__();
                    if (r12 !== null) {
                      r13 = parse_additiveExpression();
                      if (r13 !== null) {
                        r14 = parse__();
                        if (r14 !== null) {
                          r8 = [r11, r12, r13, r14];
                        } else {
                          r8 = null;
                          pos = r10;
                        }
                      } else {
                        r8 = null;
                        pos = r10;
                      }
                    } else {
                      r8 = null;
                      pos = r10;
                    }
                  } else {
                    r8 = null;
                    pos = r10;
                  }
                  if (r8 !== null) {
                    reportedPos = r9;
                    r8 = (function(a) {return a})(r13);
                  }
                  if (r8 === null) {
                    pos = r9;
                  }
                  r8 = r8 !== null ? r8 : "";
                  if (r8 !== null) {
                    if (input.substr(pos, 2).toLowerCase() === "in") {
                      r9 = input.substr(pos, 2);
                      pos += 2;
                    } else {
                      r9 = null;
                      if (reportFailures === 0) {
                        matchFailed("\"in\"");
                      }
                    }
                    if (r9 !== null) {
                      r10 = parse__();
                      if (r10 !== null) {
                        r11 = parse_list();
                        if (r11 !== null) {
                          r12 = parse__();
                          if (r12 !== null) {
                            r13 = parse_ruleList();
                            if (r13 !== null) {
                              r0 = [r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13];
                            } else {
                              r0 = null;
                              pos = r2;
                            }
                          } else {
                            r0 = null;
                            pos = r2;
                          }
                        } else {
                          r0 = null;
                          pos = r2;
                        }
                      } else {
                        r0 = null;
                        pos = r2;
                      }
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value, index, step, list, ruleList) {
        		return N('for', [value, index || null, step || null, list, ruleList])
        	})(r5, r7, r8, r11, r13);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mixin() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 6) === "@mixin") {
          r3 = "@mixin";
          pos += 6;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@mixin\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            r8 = parse_parameterList();
            if (r8 !== null) {
              r4 = [r7, r8];
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          if (r4 !== null) {
            reportedPos = r5;
            r4 = (function(p) {return p})(r8);
          }
          if (r4 === null) {
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_ruleList();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(parameterList, ruleList) {
        		return N('mixin', [parameterList || null, ruleList])
        	})(r4, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_parameterList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_parameter();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r9 = ",";
              pos++;
            } else {
              r9 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r9 !== null) {
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_parameter();
                if (r11 !== null) {
                  r5 = [r8, r9, r10, r11];
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(p) {return p})(r11);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r9 = ",";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_parameter();
                  if (r11 !== null) {
                    r5 = [r8, r9, r10, r11];
                  } else {
                    r5 = null;
                    pos = r7;
                  }
                } else {
                  r5 = null;
                  pos = r7;
                }
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(p) {return p})(r11);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('parameterList', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_parameter() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_variable();
        if (r3 !== null) {
          r5 = pos;
          r6 = pos;
          r7 = parse__();
          if (r7 !== null) {
            if (input.charCodeAt(pos) === 61) {
              r8 = "=";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"=\"");
              }
            }
            if (r8 !== null) {
              r9 = parse__();
              if (r9 !== null) {
                r10 = parse_nonCommaList();
                if (r10 !== null) {
                  r4 = [r7, r8, r9, r10];
                } else {
                  r4 = null;
                  pos = r6;
                }
              } else {
                r4 = null;
                pos = r6;
              }
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          if (r4 !== null) {
            reportedPos = r5;
            r4 = (function(s) {return s})(r10);
          }
          if (r4 === null) {
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(variable, value) {
        		return N('parameter', [variable, value || null])
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_mixinCall() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_variable();
        if (r3 !== null) {
          r5 = pos;
          r6 = pos;
          if (input.charCodeAt(pos) === 40) {
            r7 = "(";
            pos++;
          } else {
            r7 = null;
            if (reportFailures === 0) {
              matchFailed("\"(\"");
            }
          }
          if (r7 !== null) {
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_argumentList();
              r9 = r9 !== null ? r9 : "";
              if (r9 !== null) {
                r10 = parse__();
                if (r10 !== null) {
                  if (input.charCodeAt(pos) === 41) {
                    r11 = ")";
                    pos++;
                  } else {
                    r11 = null;
                    if (reportFailures === 0) {
                      matchFailed("\")\"");
                    }
                  }
                  if (r11 !== null) {
                    r4 = [r7, r8, r9, r10, r11];
                  } else {
                    r4 = null;
                    pos = r6;
                  }
                } else {
                  r4 = null;
                  pos = r6;
                }
              } else {
                r4 = null;
                pos = r6;
              }
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          if (r4 !== null) {
            reportedPos = r5;
            r4 = (function(a) {return a})(r9);
          }
          if (r4 === null) {
            pos = r5;
          }
          if (r4 !== null) {
            r5 = parse__();
            if (r5 !== null) {
              r6 = parse_semicolon();
              if (r6 !== null) {
                r0 = [r3, r4, r5, r6];
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(name, argumentList) {
        		return N('mixinCall', [name, argumentList || null])
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_keyframes() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 64) {
          r3 = "@";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r6 = pos;
          if (input.charCodeAt(pos) === 45) {
            r7 = "-";
            pos++;
          } else {
            r7 = null;
            if (reportFailures === 0) {
              matchFailed("\"-\"");
            }
          }
          if (r7 !== null) {
            r9 = pos;
            r10 = pos;
            if (/^[a-z_]/i.test(input.charAt(pos))) {
              r11 = input.charAt(pos);
              pos++;
            } else {
              r11 = null;
              if (reportFailures === 0) {
                matchFailed("[a-z_]i");
              }
            }
            if (r11 !== null) {
              r12 = [];
              if (/^[a-z0-9_]/i.test(input.charAt(pos))) {
                r13 = input.charAt(pos);
                pos++;
              } else {
                r13 = null;
                if (reportFailures === 0) {
                  matchFailed("[a-z0-9_]i");
                }
              }
              while (r13 !== null) {
                r12.push(r13);
                if (/^[a-z0-9_]/i.test(input.charAt(pos))) {
                  r13 = input.charAt(pos);
                  pos++;
                } else {
                  r13 = null;
                  if (reportFailures === 0) {
                    matchFailed("[a-z0-9_]i");
                  }
                }
              }
              if (r12 !== null) {
                r8 = [r11, r12];
              } else {
                r8 = null;
                pos = r10;
              }
            } else {
              r8 = null;
              pos = r10;
            }
            if (r8 !== null) {
              r8 = input.substring(pos, r9);
            }
            if (r8 !== null) {
              if (input.charCodeAt(pos) === 45) {
                r9 = "-";
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("\"-\"");
                }
              }
              if (r9 !== null) {
                r4 = [r7, r8, r9];
              } else {
                r4 = null;
                pos = r6;
              }
            } else {
              r4 = null;
              pos = r6;
            }
          } else {
            r4 = null;
            pos = r6;
          }
          if (r4 !== null) {
            reportedPos = r5;
            r4 = (function(p) {return p})(r8);
          }
          if (r4 === null) {
            pos = r5;
          }
          r4 = r4 !== null ? r4 : "";
          if (r4 !== null) {
            if (input.substr(pos, 9).toLowerCase() === "keyframes") {
              r5 = input.substr(pos, 9);
              pos += 9;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"keyframes\"");
              }
            }
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_identifier();
                if (r7 !== null) {
                  r8 = parse__();
                  if (r8 !== null) {
                    r9 = parse_keyframeList();
                    if (r9 !== null) {
                      r0 = [r3, r4, r5, r6, r7, r8, r9];
                    } else {
                      r0 = null;
                      pos = r2;
                    }
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(prefix, name, keyframeList) {
        		return N('keyframes', [prefix || null, name, keyframeList])
        	})(r4, r7, r9);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_keyframeList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_keyframe();
            if (r5 !== null) {
              r6 = [];
              r8 = pos;
              r9 = pos;
              r10 = parse__();
              if (r10 !== null) {
                r11 = parse_keyframe();
                if (r11 !== null) {
                  r7 = [r10, r11];
                } else {
                  r7 = null;
                  pos = r9;
                }
              } else {
                r7 = null;
                pos = r9;
              }
              if (r7 !== null) {
                reportedPos = r8;
                r7 = (function(k) {return k})(r11);
              }
              if (r7 === null) {
                pos = r8;
              }
              while (r7 !== null) {
                r6.push(r7);
                r8 = pos;
                r9 = pos;
                r10 = parse__();
                if (r10 !== null) {
                  r11 = parse_keyframe();
                  if (r11 !== null) {
                    r7 = [r10, r11];
                  } else {
                    r7 = null;
                    pos = r9;
                  }
                } else {
                  r7 = null;
                  pos = r9;
                }
                if (r7 !== null) {
                  reportedPos = r8;
                  r7 = (function(k) {return k})(r11);
                }
                if (r7 === null) {
                  pos = r8;
                }
              }
              if (r6 !== null) {
                r7 = parse__();
                if (r7 !== null) {
                  if (input.charCodeAt(pos) === 125) {
                    r8 = "}";
                    pos++;
                  } else {
                    r8 = null;
                    if (reportFailures === 0) {
                      matchFailed("\"}\"");
                    }
                  }
                  if (r8 !== null) {
                    r0 = [r3, r4, r5, r6, r7, r8];
                  } else {
                    r0 = null;
                    pos = r2;
                  }
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('keyframeList', rest)
        	})(r5, r6);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_keyframe() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_keyframeSelectorList();
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_propertyList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(keyframeSelectorList, propertyList) {
        		return N('keyframe', [keyframeSelectorList, propertyList])
        	})(r3, r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_keyframeSelectorList() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_keyframeSelector();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r9 = pos;
          r10 = parse__();
          if (r10 !== null) {
            if (input.charCodeAt(pos) === 44) {
              r11 = ",";
              pos++;
            } else {
              r11 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (r11 !== null) {
              r12 = parse__();
              if (r12 !== null) {
                r8 = [r10, r11, r12];
              } else {
                r8 = null;
                pos = r9;
              }
            } else {
              r8 = null;
              pos = r9;
            }
          } else {
            r8 = null;
            pos = r9;
          }
          if (r8 !== null) {
            r9 = parse_keyframeSelector();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(k) {return k})(r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r9 = pos;
            r10 = parse__();
            if (r10 !== null) {
              if (input.charCodeAt(pos) === 44) {
                r11 = ",";
                pos++;
              } else {
                r11 = null;
                if (reportFailures === 0) {
                  matchFailed("\",\"");
                }
              }
              if (r11 !== null) {
                r12 = parse__();
                if (r12 !== null) {
                  r8 = [r10, r11, r12];
                } else {
                  r8 = null;
                  pos = r9;
                }
              } else {
                r8 = null;
                pos = r9;
              }
            } else {
              r8 = null;
              pos = r9;
            }
            if (r8 !== null) {
              r9 = parse_keyframeSelector();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(k) {return k})(r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return N('keyframeSelectorList', rest)
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_keyframeSelector() {
        var r0, r1;
        
        r1 = pos;
        if (input.substr(pos, 4).toLowerCase() === "from") {
          r0 = input.substr(pos, 4);
          pos += 4;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"from\"");
          }
        }
        if (r0 === null) {
          if (input.substr(pos, 2).toLowerCase() === "to") {
            r0 = input.substr(pos, 2);
            pos += 2;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("\"to\"");
            }
          }
          if (r0 === null) {
            r0 = parse_percentage();
          }
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('keyframeSelector', [value])
        	})(r0);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_propertyList() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.charCodeAt(pos) === 123) {
          r3 = "{";
          pos++;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_properties();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                if (input.charCodeAt(pos) === 125) {
                  r7 = "}";
                  pos++;
                } else {
                  r7 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"}\"");
                  }
                }
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(properties) {
        		return N('propertyList', properties)
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_properties() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        r3 = parse_property();
        if (r3 !== null) {
          r4 = [];
          r6 = pos;
          r7 = pos;
          r8 = parse__();
          if (r8 !== null) {
            r9 = parse_property();
            if (r9 !== null) {
              r5 = [r8, r9];
            } else {
              r5 = null;
              pos = r7;
            }
          } else {
            r5 = null;
            pos = r7;
          }
          if (r5 !== null) {
            reportedPos = r6;
            r5 = (function(p) {return p})(r9);
          }
          if (r5 === null) {
            pos = r6;
          }
          while (r5 !== null) {
            r4.push(r5);
            r6 = pos;
            r7 = pos;
            r8 = parse__();
            if (r8 !== null) {
              r9 = parse_property();
              if (r9 !== null) {
                r5 = [r8, r9];
              } else {
                r5 = null;
                pos = r7;
              }
            } else {
              r5 = null;
              pos = r7;
            }
            if (r5 !== null) {
              reportedPos = r6;
              r5 = (function(p) {return p})(r9);
            }
            if (r5 === null) {
              pos = r6;
            }
          }
          if (r4 !== null) {
            r0 = [r3, r4];
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(first, rest) {
        		rest.unshift(first)
        		return rest
        	})(r3, r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_fontFace() {
        var r0, r1, r2, r3, r4, r5;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 10).toLowerCase() === "@font-face") {
          r3 = input.substr(pos, 10);
          pos += 10;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@font-face\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_propertyList();
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(propertyList) {
        		return N('fontFace', [propertyList])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_charset() {
        var r0, r1, r2, r3, r4, r5, r6, r7;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 8).toLowerCase() === "@charset") {
          r3 = input.substr(pos, 8);
          pos += 8;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"@charset\"");
          }
        }
        if (r3 !== null) {
          r4 = parse__();
          if (r4 !== null) {
            r5 = parse_string();
            if (r5 !== null) {
              r6 = parse__();
              if (r6 !== null) {
                r7 = parse_semicolon();
                if (r7 !== null) {
                  r0 = [r3, r4, r5, r6, r7];
                } else {
                  r0 = null;
                  pos = r2;
                }
              } else {
                r0 = null;
                pos = r2;
              }
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return N('charset', [value])
        	})(r5);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse__() {
        var r0;
        
        r0 = parse_s();
        r0 = r0 !== null ? r0 : "";
        return r0;
      }
      
      function parse_s() {
        var r0, r1;
        
        r1 = parse_ws();
        if (r1 === null) {
          r1 = parse_singleLineComment();
          if (r1 === null) {
            r1 = parse_multiLineComment();
          }
        }
        if (r1 !== null) {
          r0 = [];
          while (r1 !== null) {
            r0.push(r1);
            r1 = parse_ws();
            if (r1 === null) {
              r1 = parse_singleLineComment();
              if (r1 === null) {
                r1 = parse_multiLineComment();
              }
            }
          }
        } else {
          r0 = null;
        }
        return r0;
      }
      
      function parse_ws() {
        var r0, r1;
        
        if (/^[ \t\r\n\f]/.test(input.charAt(pos))) {
          r1 = input.charAt(pos);
          pos++;
        } else {
          r1 = null;
          if (reportFailures === 0) {
            matchFailed("[ \\t\\r\\n\\f]");
          }
        }
        if (r1 !== null) {
          r0 = [];
          while (r1 !== null) {
            r0.push(r1);
            if (/^[ \t\r\n\f]/.test(input.charAt(pos))) {
              r1 = input.charAt(pos);
              pos++;
            } else {
              r1 = null;
              if (reportFailures === 0) {
                matchFailed("[ \\t\\r\\n\\f]");
              }
            }
          }
        } else {
          r0 = null;
        }
        return r0;
      }
      
      function parse_singleLineComment() {
        var r0, r1, r2, r3, r4;
        
        r1 = pos;
        if (input.substr(pos, 2) === "//") {
          r2 = "//";
          pos += 2;
        } else {
          r2 = null;
          if (reportFailures === 0) {
            matchFailed("\"//\"");
          }
        }
        if (r2 !== null) {
          r3 = [];
          if (/^[^\r\n\f]/.test(input.charAt(pos))) {
            r4 = input.charAt(pos);
            pos++;
          } else {
            r4 = null;
            if (reportFailures === 0) {
              matchFailed("[^\\r\\n\\f]");
            }
          }
          while (r4 !== null) {
            r3.push(r4);
            if (/^[^\r\n\f]/.test(input.charAt(pos))) {
              r4 = input.charAt(pos);
              pos++;
            } else {
              r4 = null;
              if (reportFailures === 0) {
                matchFailed("[^\\r\\n\\f]");
              }
            }
          }
          if (r3 !== null) {
            r0 = [r2, r3];
          } else {
            r0 = null;
            pos = r1;
          }
        } else {
          r0 = null;
          pos = r1;
        }
        return r0;
      }
      
      function parse_multiLineComment() {
        var r0, r1, r2, r3, r4, r5, r6, r7, r8, r9;
        
        r1 = pos;
        r2 = pos;
        if (input.substr(pos, 2) === "/*") {
          r3 = "/*";
          pos += 2;
        } else {
          r3 = null;
          if (reportFailures === 0) {
            matchFailed("\"/*\"");
          }
        }
        if (r3 !== null) {
          r5 = pos;
          r4 = [];
          if (/^[^*]/.test(input.charAt(pos))) {
            r6 = input.charAt(pos);
            pos++;
          } else {
            r6 = null;
            if (reportFailures === 0) {
              matchFailed("[^*]");
            }
          }
          if (r6 === null) {
            r7 = pos;
            if (input.charCodeAt(pos) === 42) {
              r8 = "*";
              pos++;
            } else {
              r8 = null;
              if (reportFailures === 0) {
                matchFailed("\"*\"");
              }
            }
            if (r8 !== null) {
              if (/^[^\/]/.test(input.charAt(pos))) {
                r9 = input.charAt(pos);
                pos++;
              } else {
                r9 = null;
                if (reportFailures === 0) {
                  matchFailed("[^\\/]");
                }
              }
              if (r9 !== null) {
                r6 = [r8, r9];
              } else {
                r6 = null;
                pos = r7;
              }
            } else {
              r6 = null;
              pos = r7;
            }
          }
          while (r6 !== null) {
            r4.push(r6);
            if (/^[^*]/.test(input.charAt(pos))) {
              r6 = input.charAt(pos);
              pos++;
            } else {
              r6 = null;
              if (reportFailures === 0) {
                matchFailed("[^*]");
              }
            }
            if (r6 === null) {
              r7 = pos;
              if (input.charCodeAt(pos) === 42) {
                r8 = "*";
                pos++;
              } else {
                r8 = null;
                if (reportFailures === 0) {
                  matchFailed("\"*\"");
                }
              }
              if (r8 !== null) {
                if (/^[^\/]/.test(input.charAt(pos))) {
                  r9 = input.charAt(pos);
                  pos++;
                } else {
                  r9 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\\/]");
                  }
                }
                if (r9 !== null) {
                  r6 = [r8, r9];
                } else {
                  r6 = null;
                  pos = r7;
                }
              } else {
                r6 = null;
                pos = r7;
              }
            }
          }
          if (r4 !== null) {
            r4 = input.substring(pos, r5);
          }
          if (r4 !== null) {
            if (input.substr(pos, 2) === "*/") {
              r5 = "*/";
              pos += 2;
            } else {
              r5 = null;
              if (reportFailures === 0) {
                matchFailed("\"*/\"");
              }
            }
            if (r5 !== null) {
              r0 = [r3, r4, r5];
            } else {
              r0 = null;
              pos = r2;
            }
          } else {
            r0 = null;
            pos = r2;
          }
        } else {
          r0 = null;
          pos = r2;
        }
        if (r0 !== null) {
          reportedPos = r1;
          r0 = (function(value) {
        		return value
        	})(r4);
        }
        if (r0 === null) {
          pos = r1;
        }
        return r0;
      }
      
      function parse_nl() {
        var r0;
        
        if (input.substr(pos, 2) === "\r\n") {
          r0 = "\r\n";
          pos += 2;
        } else {
          r0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\r\\n\"");
          }
        }
        if (r0 === null) {
          if (/^[\n\r\f]/.test(input.charAt(pos))) {
            r0 = input.charAt(pos);
            pos++;
          } else {
            r0 = null;
            if (reportFailures === 0) {
              matchFailed("[\\n\\r\\f]");
            }
          }
        }
        return r0;
      }
      
      
      function cleanupExpected(expected) {
        expected.sort();
        
        var lastExpected = null;
        var cleanExpected = [];
        for (var i = 0; i < expected.length; i++) {
          if (expected[i] !== lastExpected) {
            cleanExpected.push(expected[i]);
            lastExpected = expected[i];
          }
        }
        return cleanExpected;
      }
      
      
      	var N = function() {
      		var node = Node.apply(this, arguments)
      
      		node.loc = options.loc || {
      			line: line(),
      			column: column(),
      			offset: offset()
      		}
      
      		return node
      	}
      
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        reportedPos = Math.max(pos, rightmostFailuresPos);
        var found = reportedPos < input.length ? input.charAt(reportedPos) : null;
        var reportedPosDetails = computeReportedPosDetails();
        
        throw new this.SyntaxError(
          cleanupExpected(rightmostFailuresExpected),
          found,
          reportedPos,
          reportedPosDetails.line,
          reportedPosDetails.column
        );
      }
      
      return result;
    }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(expected, found, offset, line, column) {
    function buildMessage(expected, found) {
      var expectedHumanized, foundHumanized;
      
      switch (expected.length) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
            + " or "
            + expected[expected.length - 1];
      }
      
      foundHumanized = found ? quote(found) : "end of input";
      
      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }
    
    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage(expected, found);
    this.offset = offset;
    this.line = line;
    this.column = column;
  };
  
  subclass(result.SyntaxError, Error);
  
  return result;
})();

var parser = {}

parser.parse = function(input, options) {
	var filePath = options.filePath || defaults.filePath

	try {
		var ast = generatedParser.parse(input, {
			startRule: options._startRule,
			loc: options._loc
		})
		if (ast.type === 'root')
			ast.filePath = filePath
		return ast
	} catch(error) {
		if (error.line) {
			var found = error.found
			switch (found) {
			case '\r':
			case '\n':
				found = 'new line'
				break
			default:
				if (!found)
					found = 'end of file'
				else
					found = "'" + found + "'"
			}
			error.message = "Unexpected " + found
			error.filePath = filePath

			if (options._loc) {
				error.line = options._loc.line
				error.column = options._loc.column
				error.offset = options._loc.offset
			}
		}

		throw error
	}
}

/**
 * Visitor
 *
 * Visit each node in the ast.
 */
var Visitor = function() {}

Visitor.prototype.visit = function(node) {
	if (Array.isArray(node))
		return this._visitNodes(node)

	var visitedNode = this._visitNode(node)
	if (visitedNode === undefined) visitedNode = node

	return visitedNode
}

Visitor.prototype._visitNode = function(node) {
	if (node === null || typeof node !== 'object')
		return

	var methodName = 'visit' + _.capitalize(node.type)
	var method = this[methodName] || this.visitNode
	return method.call(this, node)
}

Visitor.prototype._visitNodes = function(nodes) {
	var i = 0
	while (i < nodes.length) {
		var node = this._visitNode(nodes[i])

		if (node === undefined) {
			++i
			continue
		}

		if (node === null) {
			if (nodes[i] === null)
				++i
			else
				nodes.splice(i, 1)

			continue
		}

		if (!Array.isArray(node)) {
			nodes[i] = node
			++i

			continue
		}

		nodes.splice.apply(nodes, [i, 1].concat(node))
		i += node.length
	}
	return nodes
}

Visitor.prototype.visitNode = function(node) {
	if (node.children)
		this._visitNodes(node.children)
}

var loader = {}

loader.load = function(url, callback, context) {
	var xhr = new XMLHttpRequest()

	xhr.onreadystatechange = function() {
		if (xhr.readyState !== 4)
			return

		if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)
			callback.call(context, null, xhr.responseText)
		else
			callback.call(context, new Error('Failed to request file ' + url + ': ' + xhr.status))
	}

	// disable cache
	url += (~url.indexOf('?') ? '&' : '?') + '_=' + Date.now()

	try {
		xhr.open('GET', url, true)
		xhr.send(null)
	} catch (error) {
		callback.call(context, error)
	}
}

/**
 * Importer
 *
 * Import files specified in the import nodes.
 */
var Importer = function() {}

Importer.prototype = new Visitor()

Importer.prototype.import = function(ast, options, callback) {
	this.imports = options.imports || (options.imports = defaults.imports)
	this.imported = {}
	this.ast = ast
	this.callback = callback
	this.importing = 0

	try {
		this.visit(ast)
	} catch (error) {
		return callback(error)
	}

	if (!this.importing)
		callback(null, ast)
}

Importer.prototype.visitRuleset =
Importer.prototype.visitMedia =
Importer.prototype.visitVoid =
Importer.prototype.visitIf =
Importer.prototype.visitFor =
Importer.prototype.visitAssignment =
Importer.prototype.visitMixin =
Importer.prototype.visitBlock =
Importer.prototype.visitRuleList = Importer.prototype.visitNode

Importer.prototype.visitNode = _.noop

Importer.prototype.visitRoot = function(rootNode) {
	var filePath = this.filePath
	this.filePath = rootNode.filePath

	this.visit(rootNode.children)

	this.filePath = filePath
}

Importer.prototype.visitImport = function(importNode) {
	var mediaQueryListNode = importNode.children[1]
	if (mediaQueryListNode)
		return

	var urlNode = importNode.children[0]
	if (urlNode.type !== 'string' || urlNode.children.length !== 1)
		return

	var filePath = urlNode.children[0]
	if (/^\w+:\/\//.test(filePath))
		return

	if (!/\.[a-z]+$/i.test(filePath))
		filePath += '.roo'

	filePath = _.joinPaths(_.dirname(this.filePath), filePath)

	if (this.imported[filePath])
		return null

	this.imported[filePath] = true

	var content = this.imports[filePath]
	if (typeof content === 'string') {
		var ast = parser.parse(content, {filePath: filePath})
		return this.visit(ast)
	}

	++this.importing

	var callback = this.callback

	loader.load(filePath, function(error, content) {
		if (this.hasError)
			return

		if (error) {
			this.hasError = true
			return callback(error)
		}

		try {
			this.imports[filePath] = content
			var ast = parser.parse(content, {filePath: filePath})
			this.visit(ast)
		} catch (error) {
			this.hasError = true
			return callback(error)
		}

		for (var key in ast) {
			if (ast.hasOwnProperty(key))
				importNode[key] = ast[key]
		}

		if (!--this.importing)
			callback(null, this.ast)
	}, this)
}

var importer = {}

importer.import = function(ast, options, callback) {
	new Importer().import(ast, options, callback)
}

/**
 * Scope
 *
 * Regulate lexical scoping.
 */
var Scope = function() {
	this.scopes = [{}]
}

Scope.prototype.add = function() {
	this.scopes.push({})
}

Scope.prototype.remove = function() {
	this.scopes.pop()
}

Scope.prototype.define = function(name, value) {
	this.scopes[this.scopes.length - 1][name] = value
}

Scope.prototype.resolve = function(name) {
	var length = this.scopes.length
	var value

	while (length--) {
		value = this.scopes[length][name]
		if(value)
			return value
	}
}

/**
 * Evaluator
 *
 * Eliminate dynamic constructs (e.g., variable, @if, @for).
 */
var Evaluator = function() {}

Evaluator.prototype = new Visitor()

Evaluator.prototype.evaluate = function(ast) {
	this.scope = new Scope()

	return this.visit(ast)
}

Evaluator.prototype.visitRoot = function(rootNode) {
	var filePath = this.filePath
	this.filePath = rootNode.filePath

	this.visit(rootNode.children)

	this.filePath = filePath
}

Evaluator.prototype.visitRuleset = function(rulesetNode) {
	this.visit(rulesetNode.children[0])

	this.scope.add()

	var ruleListNode = this.visit(rulesetNode.children[1])

	this.scope.remove()

	if (!ruleListNode.children.length)
		return null
}

Evaluator.prototype.visitSelector = function(selectorNode) {
	var childNodes = []

	selectorNode.children.forEach(function(childNode) {
		childNode = this.visit(childNode)

		// make sure not to result in two consecutive combinators
		// which can happen when
		//	$selector = '> div';
		//	body $selector {}
		if (Array.isArray(childNode)) {
			if (
				childNode[0].type === 'combinator' &&
				childNodes.length &&
				childNodes[childNodes.length - 1].type === 'combinator'
			)
				childNodes.pop()

			childNodes = childNodes.concat(childNode)
		} else {
			childNodes.push(childNode)
		}
	}, this)

	selectorNode.children = childNodes
}

Evaluator.prototype.visitSelectorInterpolation = function(selectorInterpolationNode) {
	this.visit(selectorInterpolationNode.children)

	var valueNode = selectorInterpolationNode.children[0]
	if (valueNode.type !== 'string') {
		selectorInterpolationNode.type = 'typeSelector'
		return
	}

	var value = valueNode.children[0].trim()
	var options = {
		filePath: this.filePath,
		_startRule: 'selector',
		_loc: {
			line: valueNode.loc.line,
			column: valueNode.loc.column,
			offset: valueNode.loc.offset
		}
	}
	try{
		var selectorNode = parser.parse(value, options)
	} catch (error) {
		error.message = 'error parsing selector interpolation: ' + error.message
		throw error
	}

	return selectorNode.children
}

Evaluator.prototype.visitAssignment = function(assignmentNode) {
	var variableNode = assignmentNode.children[0]
	var variableName = variableNode.children[0]
	var operator = assignmentNode.children[1]
	var valueNode = this.visit(assignmentNode.children[2])

	if (operator === '?=' && this.scope.resolve(variableName))
		return null

	this.scope.define(variableName, valueNode)

	return null
}

Evaluator.prototype.visitVariable = function(variableNode) {
	var variableName = variableNode.children[0]
	var valueNode = this.scope.resolve(variableName)

	if (!valueNode)
		throw Err('$' + variableName + ' is undefined', variableNode, this.filePath)

	valueNode = Node.clone(valueNode, false)
	valueNode.loc = variableNode.loc

	return valueNode
}

Evaluator.prototype.visitIdentifier = function(identifierNode) {
	var childNodes = this.visit(identifierNode.children)

	var that = this
	var value = childNodes.reduce(function(value, childNode) {
		if (typeof childNode === 'string')
			return value + childNode

		switch (childNode.type) {
		case 'mixin':
			throw Err("'mixin' is not allowed to be interpolated", childNode, that.filePath)
		case 'string':
		case 'identifier':
		case 'number':
			return value + childNode.children[0]
		default:
			return value + compiler.compile(childNode)
		}
	}, '')

	identifierNode.children = [value]
}

Evaluator.prototype.visitString = function(stringNode) {
	if (stringNode.quote === "'")
		return stringNode

	var childNodes = this.visit(stringNode.children)

	var that = this
	var value = childNodes.reduce(function(value, childNode) {
		if (typeof childNode === 'string')
			return value + childNode

		switch (childNode.type) {
		case 'mixin':
			throw Err("'mixin' is not allowed to be interpolated", childNode, that.filePath)
		case 'identifier':
		case 'number':
			return value + childNode.children[0]
		case 'string':
			return value + childNode.children[0].replace(/\\?"/g, function(quote) {
				return quote.length === 1 ? '\\"' : quote
			})
		default:
			return value + compiler.compile(childNode)
		}
	}, '')

	stringNode.children = [value]
}

Evaluator.prototype.visitRange = function(rangeNode) {
	this.visit(rangeNode.children)

	var fromNode = rangeNode.children[0]
	var toNode = rangeNode.children[2]

	var invalidNode
	if (Node.toNumber(fromNode) === null)
		invalidNode = fromNode
	else if (Node.toNumber(toNode) === null)
		invalidNode = toNode

	if (invalidNode)
		throw Err("only numberic values are allowed in 'range'", invalidNode, this.filePath)
}

Evaluator.prototype.visitLogicalExpression = function(logicalExpressionNode) {
	var leftNode = logicalExpressionNode.children[0]
	var operator = logicalExpressionNode.children[1]
	var rightNode = logicalExpressionNode.children[2]

	switch (operator) {
	case 'and':
		leftNode = this.visit(leftNode)
		if (!Node.toBoolean(leftNode))
			return leftNode

		return this.visit(rightNode)

	case 'or':
		leftNode = this.visit(leftNode)
		if (Node.toBoolean(leftNode))
			return leftNode

		return this.visit(rightNode)
	}
}

Evaluator.prototype.visitEqualityExpression = function(equalityExpressionNode) {
	var leftNode = this.visit(equalityExpressionNode.children[0])
	var operator = equalityExpressionNode.children[1]
	var rightNode = this.visit(equalityExpressionNode.children[2])

	var trueNode = function() {
		return Node('boolean', [true], {loc: leftNode.loc})
	}
	var falseNode = function() {
		return Node('boolean', [false], {loc: leftNode.loc})
	}

	switch (operator) {
	case 'is':
		return Node.equal(leftNode, rightNode) ? trueNode() : falseNode()
	case 'isnt':
		return !Node.equal(leftNode, rightNode) ? trueNode() : falseNode()
	}
}

Evaluator.prototype.visitRelationalExpression = function(relationalExpressionNode) {
	var leftNode = this.visit(relationalExpressionNode.children[0])
	var operator = relationalExpressionNode.children[1]
	var rightNode = this.visit(relationalExpressionNode.children[2])

	var trueNode = function() {
		return Node('boolean', [true], {loc: leftNode.loc})
	}
	var falseNode = function() {
		return Node('boolean', [false], {loc: leftNode.loc})
	}

	var leftValue
	var rightValue

	if (
		leftNode.type === 'identifier' && rightNode.type === 'identifier' ||
		leftNode.type === 'string' && rightNode.type === 'string'
	) {
		leftValue = leftNode.children[0]
		rightValue = rightNode.children[0]
	} else {
		leftValue = Node.toNumber(leftNode)
		if (leftValue === null)
			return falseNode()

		rightValue = Node.toNumber(rightNode)
		if (rightValue === null)
			return falseNode()
	}

	switch (operator) {
	case '>':
		return leftValue > rightValue ? trueNode() : falseNode()
	case '>=':
		return leftValue >= rightValue ? trueNode() : falseNode()
	case '<':
		return leftValue < rightValue ? trueNode() : falseNode()
	case '<=':
		return leftValue <= rightValue ? trueNode() : falseNode()
	}
}

Evaluator.prototype.visitArithmeticExpression = function(arithmeticExpressionNode) {
	var leftNode = this.visit(arithmeticExpressionNode.children[0])
	var operator = arithmeticExpressionNode.children[1]
	var rightNode = this.visit(arithmeticExpressionNode.children[2])

	switch (leftNode.type + ' ' + operator + ' ' + rightNode.type) {
	case 'number + number':
	case 'percentage + number':
	case 'percentage + percentage':
	case 'percentage + dimension':
	case 'dimension + number':
	case 'dimension + percentage':
	case 'dimension + dimension':
	case 'identifier + number':
	case 'identifier + boolean':
	case 'identifier + identifier':
	case 'string + number':
	case 'string + boolean':
	case 'string + identifier':
	case 'string + string':
		var leftClone = Node.clone(leftNode)
		leftClone.children[0] += rightNode.children[0]
		return leftClone

	case 'identifier + percentage':
	case 'identifier + dimension':
	case 'string + dimension':
		var leftClone = Node.clone(leftNode)
		leftClone.children[0] += rightNode.children.join('')
		return leftClone

	case 'string + percentage':
		var leftClone = Node.clone(leftNode)
		leftClone.children[0] += rightNode.children[0] + '%'
		return leftClone

	case 'number + percentage':
	case 'number + dimension':
	case 'number + string':
	case 'boolean + identifier':
	case 'boolean + string':
	case 'identifier + string':
		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children[0] + rightClone.children[0]
		return rightClone

	case 'dimension + identifier':
	case 'dimension + string':
		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children.join('') + rightClone.children[0]
		return rightClone

	case 'percentage + string':
		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children[0] + '%' + rightClone.children[0]
		return rightClone

	case 'number - number':
	case 'percentage - percentage':
	case 'percentage - number':
	case 'percentage - dimension':
	case 'dimension - dimension':
	case 'dimension - number':
	case 'dimension - percentage':
		var leftClone = Node.clone(leftNode)
		leftClone.children[0] -= rightNode.children[0]
		return leftClone

	case 'number - dimension':
	case 'number - percentage':
		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children[0] - rightNode.children[0]
		return rightClone

	case 'number * number':
	case 'percentage * percentage':
	case 'percentage * number':
	case 'percentage * dimension':
	case 'dimension * dimension':
	case 'dimension * number':
	case 'dimension * percentage':
		var leftClone = Node.clone(leftNode)
		leftClone.children[0] *= rightNode.children[0]
		return leftClone

	case 'number * dimension':
	case 'number * percentage':
		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children[0] * rightNode.children[0]
		return rightClone

	case 'number / number':
	case 'percentage / percentage':
	case 'percentage / number':
	case 'percentage / dimension':
	case 'dimension / dimension':
	case 'dimension / number':
	case 'dimension / percentage':
		var divisor = rightNode.children[0]
		if (!divisor)
			throw Err('divide by zero', rightNode, this.filePath)

		var leftClone = Node.clone(leftNode)
		leftClone.children[0] /= divisor
		return leftClone

	case 'number / dimension':
	case 'number / percentage':
		var divisor = rightNode.children[0]
		if (!divisor)
			throw Err('divide by zero', rightNode, this.filePath)

		var rightClone = Node.clone(rightNode)
		rightClone.children[0] = leftNode.children[0] / divisor
		return rightClone
	}

	throw Err("unsupported binary operation: '" + leftNode.type + "' " + operator + " '" + rightNode.type + "'", leftNode, this.filePath)
}

Evaluator.prototype.visitUnaryExpression = function(unaryExpressionNode) {
	var operator = unaryExpressionNode.children[0]
	var operandNode = this.visit(unaryExpressionNode.children[1])

	switch (operator + operandNode.type) {
	case '+number':
	case '+percentage':
	case '+dimension':
		var operandClone = Node.clone(operandNode)
		return operandClone

	case '-number':
	case '-percentage':
	case '-dimension':
		var operandClone = Node.clone(operandNode)
		operandClone.children[0] = -operandClone.children[0]
		return operandClone
	}

	throw Err("unsupported unary operation: " + operator + "'" + operandNode.type + "'", unaryExpressionNode, this.filePath)
}

Evaluator.prototype.visitMedia = function(mediaNode) {
	this.visit(mediaNode.children[0])

	this.scope.add()
	var ruleListNode = this.visit(mediaNode.children[1])
	this.scope.remove()

	if (!ruleListNode.children.length)
		return null
}

Evaluator.prototype.visitMediaQuery = function(mediaQueryNode) {
	var childNodes = this.visit(mediaQueryNode.children)

	if (this.interpolatingMediaQuery)
		return childNodes
}

Evaluator.prototype.visitMediaInterpolation = function(mediaInterpolationNode) {
	this.visit(mediaInterpolationNode.children)

	var valueNode = mediaInterpolationNode.children[0]
	if (valueNode.type !== 'string') {
		mediaInterpolationNode.children.unshift(null)
		mediaInterpolationNode.type = 'mediaType'
		return
	}

	var value = valueNode.children[0].trim()
	var options = {
		filePath: this.filePath,
		_startRule: 'mediaQuery',
		_loc: {
			line: valueNode.loc.line,
			column: valueNode.loc.column,
			offset: valueNode.loc.offset
		}
	}
	try{
		var mediaQueryNode = parser.parse(value, options)
	} catch (error) {
		error.message = 'error parsing media query interpolation: ' + error.message
		throw error
	}

	this.interpolatingMediaQuery = true
	mediaQueryNode = this.visit(mediaQueryNode)
	this.interpolatingMediaQuery = false

	return mediaQueryNode
}

Evaluator.prototype.visitVoid = function(voidNode) {
	this.scope.add()
	this.visit(voidNode.children)
	this.scope.remove()
}

Evaluator.prototype.visitBlock = function(blockNode) {
	this.scope.add()

	var ruleListNode = blockNode.children[0]
	this.visit(ruleListNode)

	this.scope.remove()

	return ruleListNode.children
}

Evaluator.prototype.visitIf = function(ifNode) {
	var conditionNode = this.visit(ifNode.children[0])

	if (Node.toBoolean(conditionNode)) {
		var ruleListNode = ifNode.children[1]
		return this.visit(ruleListNode.children)
	}

	var alternativeNode = ifNode.children[2]
	if (!alternativeNode)
		return null

	if (alternativeNode.type === 'if')
		return this.visit(alternativeNode)

	return this.visit(alternativeNode.children)
}

Evaluator.prototype.visitFor = function(forNode) {
	var stepNode = this.visit(forNode.children[2])
	var stepNumber = 1
	if (stepNode) {
		stepNumber = Node.toNumber(stepNode)
		if (stepNumber === null)
			throw Err("step number must be a numberic value", stepNode, this.filePath)

		if (!stepNumber)
			throw Err("step number is not allowed to be zero", stepNode, this.filePath)
	}

	var listNode = this.visit(forNode.children[3])
	if (listNode.type === 'range')
		listNode = Node.toListNode(listNode)

	var valueVariableNode = forNode.children[0]
	var valueVariableName = valueVariableNode.children[0]

	var IndexVariableNode = forNode.children[1]

	if (listNode.type === 'null') {
		this.scope.define(valueVariableName, listNode)

		if (IndexVariableNode) {
			var IndexVariableName = IndexVariableNode.children[0]
			var IndexNode = Node('null', {loc: IndexVariableNode.loc})
			this.scope.define(IndexVariableName, IndexNode)
		}

		return null
	}

	var ruleListNode = forNode.children[4]

	if (listNode.type !== 'list') {
		this.scope.define(valueVariableName, listNode)

		if (IndexVariableNode) {
			var IndexVariableName = IndexVariableNode.children[0]
			var IndexNode = Node('number', [0], {loc: IndexVariableNode.loc})
			this.scope.define(IndexVariableName, IndexNode)
		}

		return this.visit(ruleListNode.children)
	}

	var itemNodes = listNode.children
	var ruleNodes = []
	var length = itemNodes.length

	if (stepNumber > 0)
		for (var i = 0, j = i, length = itemNodes.length; i < length; i += 2 * stepNumber, ++j) {
			iterate.call(this, itemNodes[i], j, i === length - 1)
		}
	else
		for (var i = itemNodes.length - 1, j = Math.floor(i / 2); i >= 0; i += 2 * stepNumber, --j) {
			iterate.call(this, itemNodes[i], j, !i)
		}

	function iterate(itemNode, i, isLast) {
		this.scope.define(valueVariableName, itemNode)

		if (IndexVariableNode) {
			var IndexVariableName = IndexVariableNode.children[0]
			var IndexNode = Node('number', [i], {loc: IndexVariableNode.loc})
			this.scope.define(IndexVariableName, IndexNode)
		}

		var ruleListClone = isLast ? ruleListNode : Node.clone(ruleListNode)
		this.visit(ruleListClone)
		ruleNodes = ruleNodes.concat(ruleListClone.children)
	}

	return ruleNodes
}

Evaluator.prototype.visitMixin = function(mixinNode) {
	var parameterList = mixinNode.children[0]
	this.visit(parameterList)
}

Evaluator.prototype.visitParameter = function(parameterNode) {
	var defaultValueNode = parameterNode.children[1]
	parameterNode.children[1] = this.visit(defaultValueNode)
}

Evaluator.prototype.visitMixinCall = function(mixinCallNode) {
	var mixinNode = this.visit(mixinCallNode.children[0])

	if (mixinNode.type !== 'mixin')
		throw Err("'" + mixinNode.type + "' is not a 'mixin'", mixinCallNode, this.filePath)

	this.scope.add()

	var argumentListNode = this.visit(mixinCallNode.children[1])
	var argumentNodes = argumentListNode ? argumentListNode.children : []

	var parameterListNode = mixinNode.children[0]
	var parameterNodes = parameterListNode ? parameterListNode.children : []

	parameterNodes.forEach(function(parameterNode, i) {
		var variableNode = parameterNode.children[0]
		var variableName = variableNode.children[0]

		if (i < argumentNodes.length) {
			this.scope.define(variableName, argumentNodes[i])
		} else {
			var valueNode = parameterNode.children[1]
			if (!valueNode)
				valueNode = Node('null', {loc: mixinCallNode.loc})

			this.scope.define(variableName, valueNode)
		}
	}, this)

	var ruleListClone = Node.clone(mixinNode.children[1])
	var childNodes = this.visit(ruleListClone.children)

	this.scope.remove()

	return childNodes
}

var evaluator = {}

evaluator.evaluate = function(ast, options) {
	return new Evaluator().evaluate(ast, options)
}

/**
 * Extender
 *
 * Join nested selectors and media queries, and extend selectors
 * specified in extend nodes.
 */
var Extender = function() {}

Extender.prototype = new Visitor()

Extender.prototype.extend = function(ast) {
	return this.visit(ast)
}

Extender.prototype.visitRuleList = Extender.prototype.visitNode

Extender.prototype.visitNode = _.noop

Extender.prototype.visitRoot = function(rootNode) {
	var filePath = this.filePath
	this.filePath = rootNode.filePath

	var extendBoundaryNode = this.extendBoundaryNode
	this.extendBoundaryNode = rootNode

	this.visit(rootNode.children)

	this.filePath = filePath
	this.extendBoundaryNode = extendBoundaryNode
}

Extender.prototype.visitRuleset = function(rulesetNode) {
	var selectorListNode = this.visit(rulesetNode.children[0])

	var parentSelectors = this.parentSelectors
	this.parentSelectors = selectorListNode.children

	this.visit(rulesetNode.children[1])

	this.parentSelectors = parentSelectors
}

Extender.prototype.visitSelectorList = function(selectorListNode) {
	var selectorListClone = Node.clone(selectorListNode, false)
	selectorListClone.children = selectorListNode.children
	selectorListNode.originalNode = selectorListClone

	var selectors = []
	if (this.parentSelectors) {
		this.parentSelectors.forEach(function(parentSelector) {
			this.parentSelector = parentSelector

			selectorListNode.children.forEach(function(selectorNode) {
				selectors.push(this.visit(selectorNode))
			}, this)
		}, this)
	} else {
		this.parentSelector = null
		selectorListNode.children.forEach(function(selectorNode) {
			selectors.push(this.visit(selectorNode))
		}, this)
	}

	selectorListNode.children = selectors
}

Extender.prototype.visitSelector = function(selectorNode) {
	var hasAmpersandSelector = false
	var startWithCombinator = false

	var selector = ''
	selectorNode.children.forEach(function(childNode, i) {
		switch (childNode.type) {
		case 'ampersandSelector':
			if (!this.parentSelector)
				throw Err("& selector is not allowed at the top level", childNode, this.filePath)

			hasAmpersandSelector = true
			selector += this.parentSelector
			break
		case 'combinator':
			if (!i) {
				if (!this.parentSelector)
					throw Err("selector starting with a combinator is not allowed at the top level", childNode, this.filePath)

				startWithCombinator = true
			}

			// fall through
		default:
			selector += compiler.compile(childNode)
		}
	}, this)

	if (hasAmpersandSelector)
		return selector

	if (startWithCombinator)
		return this.parentSelector + selector

	return  this.parentSelector ? this.parentSelector + ' ' + selector : selector
}

Extender.prototype.visitMedia = function(mediaNode) {
	var mediaQueryListNode = this.visit(mediaNode.children[0])

	var parentMediaQueries = this.parentMediaQueries
	this.parentMediaQueries = mediaQueryListNode.children

	this.visit(mediaNode.children[1])

	this.parentMediaQueries = parentMediaQueries
}

Extender.prototype.visitMediaQueryList = function(mediaQueryListNode) {
	if (this.parentMediaQueries) {
		var parentMediaQueries = []

		this.parentMediaQueries.forEach(function(parentMediaQuery) {
			this.parentMediaQuery = parentMediaQuery

			mediaQueryListNode.children.forEach(function(mediaQueryNode) {
				parentMediaQueries.push(this.visit(mediaQueryNode))
			}, this)
		}, this)

		mediaQueryListNode.children = parentMediaQueries
	} else {
		this.parentMediaQuery = ''
		this.visit(mediaQueryListNode.children)
	}
}

Extender.prototype.visitMediaQuery = function(mediaQueryNode) {
	var mediaQuery = compiler.compile(mediaQueryNode)
	var parentMediaQuery = this.parentMediaQuery
	if (parentMediaQuery) parentMediaQuery += ' and '
	return parentMediaQuery + mediaQuery
}

Extender.prototype.visitExtend = function(extendNode) {
	var nodes = this.extendBoundaryNode.children
	var options = {
		extendNode: extendNode,
		insideVoid: !!this.parentVoid
	}

	if (this.parentMediaQueries) {
		var mediaNodes = new MediaFilter().filter(nodes, this.parentMediaQueries, options)
		nodes = []
		mediaNodes.forEach(function(mediaNode) {
			nodes = nodes.concat(mediaNode.children)
		})
	}

	var selectorListNode = extendNode.children[0]
	selectorListNode.children.forEach(function(selectorNode) {
		selectorNode = compiler.compile(selectorNode)
		new RulesetExtender().extend(nodes, selectorNode, this.parentSelectors, options)
	}, this)

	return null
}

Extender.prototype.visitVoid = function(voidNode) {
	var parentVoid = this.parentVoid
	this.parentVoid = voidNode

	var extendBoundaryNode = this.extendBoundaryNode
	this.extendBoundaryNode = voidNode

	this.visit(voidNode.children)

	this.parentVoid = parentVoid
	this.extendBoundaryNode = extendBoundaryNode
}

/**
 * Media Filter
 *
 * Find medias matching the passed media queries
 */
var MediaFilter = function() {}

MediaFilter.stop = {}

MediaFilter.prototype = new Visitor()

MediaFilter.prototype.filter = function(ast, mediaQueries, options) {
	this.mediaQueries = mediaQueries
	this.mediaNodes = []

	try {
		this.visit(ast)
	} catch (error) {
		if (error !== MediaFilter.stop)
			throw error
	}

	return this.mediaNodes
}

MediaFilter.prototype.visitRoot =
MediaFilter.prototype.visitVoid =
MediaFilter.prototype.visitRuleset =
MediaFilter.prototype.visitRuleList = MediaFilter.prototype.visitNode

MediaFilter.prototype.visitNode = _.noop

MediaFilter.prototype.visitMedia = function(mediaNode) {
	var mediaQueryListNode = mediaNode.children[0]
	var mediaQueries = mediaQueryListNode.children
	var ruleListNode = mediaNode.children[1]

	if (mediaQueries === this.mediaQueries) {
		this.mediaNodes.push(mediaNode)
		throw MediaFilter.stop
	}

	if (Node.equal(mediaQueries, this.mediaQueries))
		this.mediaNodes.push(mediaNode)
	else
		this.visit(ruleListNode)
}

/**
 * Selector Extender
 *
 * Extend passed rulesets with the passed parent selectors
 */
var SelectorExtender = function() {}

SelectorExtender.stop = {}

SelectorExtender.prototype = new Visitor()

SelectorExtender.prototype.extend = function(rulesetNode, parentSelectors, options) {
	this.parentSelectors = parentSelectors
	this.extendNode = options.extendNode
	this.insideVoid = options.insideVoid

	var selectorListNode = rulesetNode.children[0]
	selectorListNode.children = selectorListNode.children.concat(parentSelectors)

	if (!this.insideVoid) {
		if (!selectorListNode.extendedSelectors)
			selectorListNode.extendedSelectors = parentSelectors
		else
			selectorListNode.extendedSelectors = selectorListNode.extendedSelectors.concat(parentSelectors)
	}

	var ruleListNode = rulesetNode.children[1]

	try {
		this.visit(ruleListNode)
	} catch (error) {
		if (error !== SelectorExtender.stop)
			throw error
	}
}

SelectorExtender.prototype.visitRoot =
SelectorExtender.prototype.visitMedia =
SelectorExtender.prototype.visitRuleList = SelectorExtender.prototype.visitNode

SelectorExtender.prototype.visitNode = _.noop

SelectorExtender.prototype.visitExtend = function(extendNode) {
	if (extendNode === this.extendNode)
		throw SelectorExtender.stop
}

SelectorExtender.prototype.visitRuleset = function(rulesetNode) {
	var selectorListNode = this.visit(rulesetNode.children[0])

	var parentSelectors = this.parentSelectors
	this.parentSelectors = selectorListNode.children

	var ruleListNode = rulesetNode.children[1]
	this.visit(ruleListNode)

	this.parentSelectors = parentSelectors
}

SelectorExtender.prototype.visitSelectorList = function(selectorListNode) {
	var selectorListClone = Node.clone(selectorListNode.originalNode, false)

	var extender = new Extender()
	extender.parentSelectors = this.parentSelectors
	selectorListClone = extender.extend(selectorListClone, this.options)

	selectorListNode.children = selectorListNode.children.concat(selectorListClone.children)

	if (!this.insideVoid) {
		if (!selectorListNode.extendedSelectors)
			selectorListNode.extendedSelectors = selectorListClone.children
		else
			selectorListNode.extendedSelectors = selectorListNode.extendedSelectors.concat(selectorListClone.children)
	}

	return selectorListClone
}

/**
 * Ruleset Extender
 *
 * Find ruleset node matching the passed selector and extend them with the
 * passed parent selectors
 */
var RulesetExtender = function() {}

RulesetExtender.stop = {}

RulesetExtender.prototype = new Visitor()

RulesetExtender.prototype.extend = function(ast, selectorNode, parentSelectors, options) {
	this.parentSelectors = parentSelectors
	this.selectorNode = selectorNode
	this.extendNode = options.extendNode
	this.options = options

	try {
		this.visit(ast)
	} catch (error) {
		if (error !== RulesetExtender.stop)
			throw error
	}
}

RulesetExtender.prototype.visitRoot =
RulesetExtender.prototype.visitVoid =
RulesetExtender.prototype.visitRuleList = RulesetExtender.prototype.visitNode

RulesetExtender.prototype.visitNode = _.noop

RulesetExtender.prototype.visitExtend = function(extendNode) {
	if (extendNode === this.extendNode)
		throw RulesetExtender.stop
}

RulesetExtender.prototype.visitRuleset = function(rulesetNode) {
	var selectorListNode = rulesetNode.children[0]

	var selectorMatched = selectorListNode.children.some(function(selectorNode) {
		if (this.extendNode.all) {
			if (~selectorNode.indexOf(this.selectorNode)) {
				var parentSelectors = []
				this.parentSelectors.forEach(function(parentSelector) {
					parentSelector = selectorNode.split(this.selectorNode).join(parentSelector)
					parentSelectors.push(parentSelector)
				}, this)

				new SelectorExtender().extend(rulesetNode, parentSelectors, this.options)
				return true
			}
		} else if (this.selectorNode === selectorNode) {
			new SelectorExtender().extend(rulesetNode, this.parentSelectors, this.options)
			return true
		}
	}, this)

	if (selectorMatched)
		return

	var ruleListNode = rulesetNode.children[1]
	this.visit(ruleListNode)
}

var extender = {}

extender.extend = function(ast, options) {
	return new Extender().extend(ast, options)
}

/**
 * Normalizer
 *
 * Remove empty ruleset/media nodes, unextended void nodes, etc.
 */
var Normalizer = function() {}

Normalizer.prototype = new Visitor()

Normalizer.prototype.normalize = function(ast) {
	return this.visit(ast)
}

Normalizer.prototype.visitRoot =
Normalizer.prototype.visitRuleList = Normalizer.prototype.visitNode

Normalizer.prototype.visitNode = _.noop

Normalizer.prototype.visitRoot = function(rootNode) {
	var parentRoot = this.parentRoot
	this.parentRoot = rootNode

	var filePath = this.filePath
	this.filePath = rootNode.filePath

	var childNodes = this.visit(rootNode.children)

	this.parentRoot = parentRoot
	this.filePath = filePath

	if (parentRoot && !childNodes.length)
		return null
}

Normalizer.prototype.visitRuleset = function(rulesetNode) {
	var selectorListNode = rulesetNode.children[0]

	if (this.parentVoid) {
		if (!selectorListNode.extendedSelectors)
			return null

		selectorListNode.children = selectorListNode.extendedSelectors
	}

	var parentSelectorList = this.parentSelectorList
	this.parentSelectorList = selectorListNode

	var ruleListNode = this.visit(rulesetNode.children[1])

	this.parentSelectorList = parentSelectorList

	var propertyNodes = []
	var otherNodes = []

	ruleListNode.children.forEach(function(childNode) {
		if (childNode.type === 'property')
			propertyNodes.push(childNode)
		else
			otherNodes.push(childNode)
	})

	if (!propertyNodes.length)
		return otherNodes

	var firstPropertyNode = propertyNodes[0]
	var propertyListNode = Node('propertyList', propertyNodes, {loc: firstPropertyNode.loc})

	// bubble child medias if under a media
	if (this.parentMedia) {
		var mediaNodes = []
		var others = []
		otherNodes.forEach(function(node) {
			if (node.type === 'media')
				mediaNodes.push(node)
			else
				others.push(node)
		})
		otherNodes = others
	}

	if (!otherNodes.length)
		ruleListNode = null
	else
		ruleListNode.children = otherNodes

	rulesetNode.children = [selectorListNode, propertyListNode, ruleListNode]

	if (this.parentMedia && mediaNodes.length)
		return [rulesetNode].concat(mediaNodes)
}

Normalizer.prototype.visitMedia = function(mediaNode) {
	var mediaQueryListNode = mediaNode.children[0]

	var parentMedia = this.parentMedia
	this.parentMedia = mediaNode

	var ruleListNode = this.visit(mediaNode.children[1])

	this.parentMedia = parentMedia

	var propertyNodes = []
	var rulesetNodes = []
	var otherNodes = []

	ruleListNode.children.forEach(function(childNode) {
		switch (childNode.type) {
		case 'property':
			propertyNodes.push(childNode)
			break
		case 'ruleset':
			rulesetNodes.push(childNode)
			break
		default:
			otherNodes.push(childNode)
		}
	})

	if (propertyNodes.length) {
		if (!this.parentSelectorList)
			throw Err("@media containing properties is not allowed at the top level", mediaNode, this.filePath)

		var firstPropertyNode = propertyNodes[0]
		var propertyList = Node('propertyList', propertyNodes, {loc: firstPropertyNode.loc})

		var rulesetChildNodes = [this.parentSelectorList, propertyList, null]
		var rulesetNode = Node('ruleset', rulesetChildNodes, {loc: this.parentSelectorList.loc})
		rulesetNodes.unshift(rulesetNode)
	}

	if (!rulesetNodes.length)
		return otherNodes

	var firstRulesetNode = rulesetNodes[0]
	var rulesetListNode = Node('rulesetList', rulesetNodes, {loc: firstRulesetNode.loc})

	if (!otherNodes.length)
		ruleListNode = null
	else
		ruleListNode.children = otherNodes

	mediaNode.children = [mediaQueryListNode, rulesetListNode, ruleListNode]
}

Normalizer.prototype.visitVoid = function(voidNode) {
	var parentVoid = this.parentVoid
	this.parentVoid = voidNode

	var ruleListNode = voidNode.children[0]
	this.visit(ruleListNode)

	this.parentVoid = parentVoid

	return ruleListNode.children
}

var normalizer = {}

normalizer.normalize = function(ast, options) {
	return new Normalizer().normalize(ast, options)
}

/**
 * Prefixer
 *
 * Prefix property nodes, keyframes nodes, etc
 */
var Prefixer = function() {}

Prefixer.prototype = new Visitor()

Prefixer.prototype.prefix = function(ast, options) {
	this.prefixes = options.prefix || defaults.prefix
	this.skipPrefixed = options.skipPrefixed
	return this.visit(ast)
}

Prefixer.prototype.visitRoot =
Prefixer.prototype.visitRuleset =
Prefixer.prototype.visitMedia =
Prefixer.prototype.visitKeyframeList =
Prefixer.prototype.visitKeyframe =
Prefixer.prototype.visitRuleList = Prefixer.prototype.visitNode

Prefixer.prototype.visitNode = _.noop

/**
 * PropertyNamePrefixer
 *
 * Prefix property name
 */
var PropertyNamePrefixer = function() {}

PropertyNamePrefixer.prototype = new Visitor()

PropertyNamePrefixer.prototype.prefix = function(propertyNameNode, options) {
	this.prefixes = options.prefixes
	this.parentPropertyList = options.parentPropertyList

	return this.visit(propertyNameNode)
}

PropertyNamePrefixer.prototype.visitIdentifier = function(identifierNode) {
	var propertyName = identifierNode.children[0]
	var prefixedPropertyNameNodes = []

	switch (propertyName) {
	case 'box-sizing':
	case 'box-shadow':
	case 'border-radius':
		var prefixes = _.intersect(this.prefixes, ['webkit', 'moz'])
		break
	case 'user-select':
		var prefixes = _.intersect(this.prefixes, ['webkit', 'moz', 'ms'])
		break
	case 'transition-duration':
	case 'transition-property':
	case 'transition':
		var prefixes = _.intersect(this.prefixes, ['webkit', 'moz', 'o'])
		break
	case 'transform':
		var prefixes = this.prefixes
		break
	default:
		return prefixedPropertyNameNodes
	}

	prefixes.forEach(function(prefix) {
		var prefixedPropertyName = '-' + prefix + '-' + propertyName
		if (this.parentPropertyList) {
			if (this.parentPropertyList.children.some(function(propertyNode) {
				var propertyNameNode = propertyNode.children[0]
				var propertyName = propertyNameNode.children[0]
				return prefixedPropertyName === propertyName
			}))
				return
		}
		var prefixedPropertyNameNode = Node.clone(identifierNode)
		prefixedPropertyNameNode.children[0] = prefixedPropertyName
		prefixedPropertyNameNodes.push(prefixedPropertyNameNode)
	}, this)

	return prefixedPropertyNameNodes
}

/**
 * LinearGradientPrefixer
 *
 * Visit property value nodes to prefix linear-gradient()
 */
var LinearGradientPrefixer = function() {}

LinearGradientPrefixer.stop = {}

LinearGradientPrefixer.prototype = new Visitor()

LinearGradientPrefixer.prototype.prefix = function(propertyValueNode, options) {
	var prefixes = _.intersect(options.prefixes, ['webkit', 'moz', 'o'])

	var prefixedPropertyValueNodes = []

	this.hasLinearGradient = false
	try {
		this.visit(propertyValueNode)
	} catch (error) {
		if (error !== LinearGradientPrefixer.stop)
			throw err
	}
	if (!this.hasLinearGradient)
		return prefixedPropertyValueNodes

	prefixes.forEach(function(prefix) {
		this.currentPrefix = prefix

		var propertyValueClone = Node.clone(propertyValueNode)
		var prefixedPropertyValueNode = this.visit(propertyValueClone)

		prefixedPropertyValueNodes.push(prefixedPropertyValueNode)
	}, this)

	return prefixedPropertyValueNodes
}

LinearGradientPrefixer.prototype.visitFunction = function(functionNode) {
	var functionName = functionNode.children[0]

	if (functionName !== 'linear-gradient')
		return

	if (!this.hasLinearGradient) {
		this.hasLinearGradient = true
		throw LinearGradientPrefixer.stop
	}

	functionNode.children[0] = '-' + this.currentPrefix + '-' + functionName

	var argumentListNode = functionNode.children[1]

	var firstArgumentNode = argumentListNode.children[0]
	if (firstArgumentNode.type !== 'list')
		return

	var firstListItemNode = firstArgumentNode.children[0]
	if (firstListItemNode.type !== 'identifier' || firstListItemNode.children[0] !== 'to')
		return

	var positionNodes = firstArgumentNode.children.slice(2)
	firstArgumentNode.children = positionNodes.map(function(positionNode) {
		if (positionNode.type !== 'identifier')
			return positionNode

		var positionName = positionNode.children[0]
		switch (positionName) {
		case 'top':
			positionName = 'bottom'
			break
		case 'bottom':
			positionName = 'top'
			break
		case 'left':
			positionName = 'right'
			break
		case 'right':
			positionName = 'left'
			break
		}
		positionNode.children[0] = positionName

		return positionNode
	})
}

Prefixer.prototype.visitProperty = function(propertyNode) {
	var propertyNameNode = propertyNode.children[0]
	var propertyValueNode = propertyNode.children[1]

	var propertyName = propertyNameNode.children[0]
	var propertyNodes = []

	switch (propertyName) {
	case 'background':
	case 'background-image':
		var options = {
			prefixes: this.prefixes
		}
		var prefixedPropertyValueNodes = new LinearGradientPrefixer().prefix(propertyValueNode, options)

		prefixedPropertyValueNodes.forEach(function(prefixedPropertyValueNode) {
			var propertyClone = Node.clone(propertyNode, false)
			propertyClone.children = [propertyNameNode, prefixedPropertyValueNode]
			propertyNodes.push(propertyClone)
		})

		break

	default:
		var options = {
			prefixes: this.prefixes,
			parentPropertyList: this.parentPropertyList
		}
		var prefixedPropertyNameNodes = new PropertyNamePrefixer().prefix(propertyNameNode, options)

		prefixedPropertyNameNodes.forEach(function(prefixedPropertyNameNode) {
			var propertyClone = Node.clone(propertyNode, false)
			propertyClone.children = [prefixedPropertyNameNode, propertyValueNode]
			propertyNodes.push(propertyClone)
		})
	}

	if (!propertyNodes.length)
		return

	propertyNodes.push(propertyNode)
	return propertyNodes
}

Prefixer.prototype.visitPropertyList = function(propertyListNode) {
	if (this.skipPrefixed) {
		var parentPropertyList = this.parentPropertyList
		this.parentPropertyList = propertyListNode

		this.visit(propertyListNode.children)

		this.parentPropertyList = parentPropertyList
	} else {
		this.visit(propertyListNode.children)
	}
}

Prefixer.prototype.visitKeyframes = function(keyframesNode) {
	var prefix = keyframesNode.children[0]
	if (prefix)
		return

	var keyframeNameNode = this.visit(keyframesNode.children[1])
	var keyframeListNode = keyframesNode.children[2]

	var prefixes = _.intersect(this.prefixes, ['webkit', 'moz', 'o'])

	var keyframesNodes = []

	prefixes.forEach(function(prefix) {
		this.prefixes = [prefix]
		var keyframeListClone = Node.clone(keyframeListNode)
		this.visit(keyframeListClone)

		var keyframesClone = Node.clone(keyframesNode, false)
		keyframesClone.children = [prefix, keyframeNameNode, keyframeListClone]

		keyframesNodes.push(keyframesClone)
	}, this)

	keyframesNodes.push(keyframesNode)

	return keyframesNodes
}

var prefixer = {}

prefixer.prefix = function(ast, options) {
	return new Prefixer().prefix(ast, options)
}

/**
 * Compiler
 *
 * Compile ast to css.
 */
var Compiler = function() {}

Compiler.prototype = new Visitor()

Compiler.prototype.compile = function(ast, options) {
	if (!options) options = {}
	this.indentUnit = options.indent || defaults.indent
	this.precision = options.precision || defaults.precision
	this.indentLevel = 0

	return this.visit(ast)
}

Compiler.prototype.indent = function() {
	++this.indentLevel
}

Compiler.prototype.outdent = function() {
	--this.indentLevel
}

Compiler.prototype.indentString = function() {
	return Array(this.indentLevel + 1).join(this.indentUnit)
}

Compiler.prototype.visitNode = function(node) {
	return this.visit(node.children).join('')
}

Compiler.prototype.visitRoot = function(rootNode) {
	return this.visit(rootNode.children).join('\n\n')
}

Compiler.prototype.visitComment = function(commentNode) {
	return '/*' + commentNode.children[0] + '*/'
}

Compiler.prototype.visitRuleset = function(rulesetNode) {
	var selectorListNode = rulesetNode.children[0]
	var css = this.visit(selectorListNode) + ' {\n'

	var propertyListNode = rulesetNode.children[1]
	this.indent()
	css += this.indentString() + this.visit(propertyListNode)
	this.outdent()
	css += '\n' + this.indentString() + '}'

	var ruleListNode = rulesetNode.children[2]
	if (ruleListNode) {
		this.indent()
		css += '\n' + this.indentString() + this.visit(ruleListNode)
		this.outdent()
	}

	return css
}

Compiler.prototype.visitSelectorList = function(selectorListNode) {
	return this.visit(selectorListNode.children).join(',\n' + this.indentString())
}

Compiler.prototype.visitCombinator = function(combinatorNode) {
	var value = combinatorNode.children[0]
	if (value !== ' ')
		value = ' ' + value + ' '

	return value
}

Compiler.prototype.visitUniversalSelector = function(universalSelectorNode) {
	return '*'
}

Compiler.prototype.visitClassSelector = function(classSelectorNode) {
	return '.' + this.visit(classSelectorNode.children[0])
}

Compiler.prototype.visitHashSelector = function(hashSelectorNode) {
	return '#' + this.visit(hashSelectorNode.children[0])
}

Compiler.prototype.visitAttributeSelector = function(attributeSelectorNode) {
	return '[' + this.visit(attributeSelectorNode.children).join('') + ']'
}

Compiler.prototype.visitNegationSelector = function(negationSelectorNode) {
	return ':not(' + this.visit(negationSelectorNode.children[0]) + ')'
}

Compiler.prototype.visitPseudoSelector = function(pseudoSelectorNode) {
	return (pseudoSelectorNode.doubled ? '::' : ':') + this.visit(pseudoSelectorNode.children[0])
}

Compiler.prototype.visitPropertyList = function(propertyListNode) {
	return this.visit(propertyListNode.children).join(';\n' + this.indentString()) + ';'
}

Compiler.prototype.visitProperty = function(propertyNode) {
	var css = this.visit(propertyNode.children[0]) + ': ' +  this.visit(propertyNode.children[1])

	var priority = propertyNode.children[2]
	if (priority)
		css += ' ' + priority

	return css
}

Compiler.prototype.visitRulesetList = Compiler.prototype.visitRulesetList

Compiler.prototype.visitRuleList = function(ruleListNode) {
	return this.visit(ruleListNode.children).join('\n' + this.indentString())
}

Compiler.prototype.visitMedia = function(mediaNode) {
	var mediaQueryListNode = mediaNode.children[0]
	var css = '@media'
	css += mediaQueryListNode.children.length > 1 ? '\n' + this.indentString() : ' '
	css += this.visit(mediaQueryListNode) + ' {\n'

	var rulesetListNode = mediaNode.children[1]
	this.indent()
	css += this.indentString() + this.visit(rulesetListNode)
	this.outdent()
	css += '\n' + this.indentString() + '}'

	var ruleListNode = mediaNode.children[2]
	if (ruleListNode) {
		this.indent()
		css += '\n' + this.indentString() + this.visit(ruleListNode)
		this.outdent()
	}

	return css
}

Compiler.prototype.visitMediaQueryList = function(mediaQueryListNode) {
	return this.visit(mediaQueryListNode.children).join(',\n' + this.indentString())
}

Compiler.prototype.visitMediaQuery = function(mediaQueryNode) {
	return this.visit(mediaQueryNode.children).join(' and ')
}

Compiler.prototype.visitMediaType = function(mediaTypeNode) {
	var modifier = mediaTypeNode.children[0]
	if (!modifier)
		mediaTypeNode.children.shift()

	return this.visit(mediaTypeNode.children).join(' ')
}

Compiler.prototype.visitMediaFeature = function(mediaFeatureNode) {
	this.visit(mediaFeatureNode.children)
	var name = mediaFeatureNode.children[0]
	var value = mediaFeatureNode.children[1]

	return '(' + name + (value ? ': ' + value : '') + ')'
}

Compiler.prototype.visitImport = function(importNode) {
	var css = '@import '
	var url = this.visit(importNode.children[0])
	var mediaQuery = this.visit(importNode.children[1])

	css += url

	if (mediaQuery)
		css += ' ' + mediaQuery

	css += ';'

	return  css
}

Compiler.prototype.visitUrl = function(urlNode) {
	return 'url(' + this.visit(urlNode.children[0]) + ')'
}

Compiler.prototype.visitString = function(stringNode) {
	return stringNode.quote + stringNode.children[0] + stringNode.quote
}

Compiler.prototype.visitNumber = function(numberNode) {
	return '' + +numberNode.children[0].toFixed(this.precision)
}

Compiler.prototype.visitPercentage = function(percentageNode) {
	return +percentageNode.children[0].toFixed(this.precision) + '%'
}

Compiler.prototype.visitDimension = function(dimensionNode) {
	return +dimensionNode.children[0].toFixed(this.precision) + dimensionNode.children[1]
}

Compiler.prototype.visitColor = function(colorNode) {
	return '#' + colorNode.children[0]
}

Compiler.prototype.visitFunction = function(functionNode) {
	var functionName = this.visit(functionNode.children[0])
	var functionArguments = this.visit(functionNode.children[1])

	return functionName + '(' + functionArguments + ')'
}

Compiler.prototype.visitArgumentList = function(argumentListNode) {
	return this.visit(argumentListNode.children).join(', ')
}

Compiler.prototype.visitRange = function(rangeNode) {
	return this.visit(Node.toListNode(rangeNode))
}

Compiler.prototype.visitNull = function(nullNode) {
	return 'null'
}

Compiler.prototype.visitSeparator = function(separatorNode) {
	var value = separatorNode.children[0]
	if (value === ',')
		value += ' '

	return value
}

Compiler.prototype.visitKeyframes = function(keyframesNode) {
	var css = '@'

	var prefix = keyframesNode.children[0]
	if (prefix)
		css += '-' + prefix + '-'

	var nameNode = keyframesNode.children[1]
	css += 'keyframes ' + this.visit(nameNode) + ' {\n'

	var ruleListNode = keyframesNode.children[2]
	this.indent()
	css += this.indentString() + this.visit(ruleListNode)
	this.outdent()
	css += '\n' + this.indentString() + '}'

	return css
}

Compiler.prototype.visitKeyframeList = Compiler.prototype.visitRuleList

Compiler.prototype.visitKeyframe = function(keyframeNode) {
	var css = this.visit(keyframeNode.children[0]) + ' {\n'
	this.indent()
	css += this.indentString() + this.visit(keyframeNode.children[1])
	this.outdent()
	css += '\n' + this.indentString() + '}'

	return css
}

Compiler.prototype.visitKeyframeSelectorList = function(keyframeSelectorListNode) {
	return this.visit(keyframeSelectorListNode.children).join(', ')
}

Compiler.prototype.visitFontFace = function(fontFaceNode) {
	var css = '@font-face {\n'
	this.indent()
	css += this.indentString() + this.visit(fontFaceNode.children[0])
	this.outdent()
	css += '\n' + this.indentString() + '}'

	return css
}

Compiler.prototype.visitCharset = function(charsetNode) {
	return '@charset ' + this.visit(charsetNode.children[0]) + ';'
}

var compiler = {}

compiler.compile = function(ast, options) {
	return new Compiler().compile(ast, options)
}

/**
 * Formmatter
 *
 * Make error message contain input context.
 */
var formatter = {}

formatter.format = function(error, input) {
	var message = error.message
	if (input === undefined)
		return message

	var lineNumber = error.line
	var columnNumber = error.column
	var filePath = error.filePath
	var lines = input.split(/\r\n|[\r\n]/)
	var siblingLineSize = 4
	var startLineNumber = Math.max(lineNumber - siblingLineSize, 1)
	var endLineNumber = Math.min(lineNumber + siblingLineSize, lines.length)
	var maxLineNumberDigitCount = endLineNumber.toString().length

	var context = lines.slice(startLineNumber - 1, endLineNumber).reduce(function(context, line, i) {
		var tabCount = 0
		line = line.replace(/^\t+/, function(tabs) {
			tabCount = tabs.length
			return Array(tabCount + 1).join('  ')
		})

		var currentLineNumber = i + startLineNumber
		var currentLineNumberDigitCount = currentLineNumber.toString().length

		context += '  '
		         + Array(maxLineNumberDigitCount - currentLineNumberDigitCount + 1).join(' ')
		         + currentLineNumber
		         + '| '
		         + line
		         + '\n'

		if (i + startLineNumber === lineNumber)
			context += '  '
			         + Array(maxLineNumberDigitCount + 1).join('-')
			         + '--'
			         + Array(columnNumber + tabCount).join('-')
			         + '^\n'

		return context
	}, '')

	return message
	     + '\n\n  ' + '(' + (filePath ? filePath + ' ' : '') + error.line + ':' + error.column + ')'
	     + '\n' + context
}

/**
 * Roole
 *
 * Expose public APIs.
 */
var roole = {}

roole.compile = function(input, options, callback) {
	if (!callback) {
		callback = options
		options = {}
	} else if (!options) {
		options = {}
	}

	if (options.prettyError) {
		var _callback = callback
		callback = function(error, ast) {
			if (error && error.line) {
				if (error.filePath && options.imports)
					input = options.imports[error.filePath]

				error.message = formatter.format(error, input)
			}

			_callback(error, ast)
		}
	}


	var ast, output

	try {
		ast = parser.parse(input, options)
	} catch (error) {
		return callback(error)
	}

	importer.import(ast, options, function(error, ast) {
		if (error)
				return callback(error)

		try {
			ast = evaluator.evaluate(ast, options)
			ast = extender.extend(ast, options)
			ast = normalizer.normalize(ast, options)
			ast = prefixer.prefix(ast, options)
			output = compiler.compile(ast, options)
		}
		catch (error) {
			return callback(error)
		}

		callback(null, output)
	})
}

/**
 * Compile style and link elements in the HTML.
 */
var selector = 'link[rel="stylesheet/roole"],style[type="text/roole"]'
var elements = document.querySelectorAll(selector)

Array.prototype.forEach.call(elements, function(element) {
	var styleElement = document.createElement('style')
	document.head.appendChild(styleElement)

	var options = {
		prettyError: true
	}

	if (element.nodeName === 'STYLE') {
		roole.compile(element.textContent, options, function(error, css) {
			if (error) {
				displayError(error.message)
				throw error
			}

			styleElement.textContent = css
		})
	} else if (element.nodeName === 'LINK') {
		var url = element.getAttribute('href')
		loader.load(url, function(error, content) {
			if (error) {
				displayError(error.message)
				throw error
			}

			options.filePath = url
			roole.compile(content, options, function(error, css) {
				if (error) {
					displayError(error.message)
					throw error
				}

				styleElement.textContent = css
			})
		})
	}
})

function displayError(message) {
	var errorElement = document.createElement('pre')
	var style = [
		['font', '14px/1.25 Menlo,Monaco,Consolas,"Lucida Console",monospace'],
		['border', '3px solid #f60f92'],
		['color', '#000'],
		['background-color', '#ffeff4'],
		['padding', '1em'],
		['margin', '0'],
		['position', 'fixed'],
		['top', '0'],
		['left', '0'],
		['right', '0'],
		['z-index', '99999999']
	].map(function(property) { return property[0] + ':' + property[1] }).join(';')
	errorElement.setAttribute('style', style)
	errorElement.textContent = message
	document.body.appendChild(errorElement)
}

roole.version = '0.3.1'

return roole

})()
