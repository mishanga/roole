CodeMirror.defineMode('css', function(config) {
	function tokenRule(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('}')) {
			if (state.tokenize.length > 1)
				state.tokenize.pop()
			return null
		}

		if (stream.match(/^@media/i)) {
			state.tokenize.push(tokenMediaQueryUntilBrace)
			return 'at-rule'
		}

		if (stream.match(/^@import/i)) {
			state.tokenize.push(tokenImport)
			return 'at-rule'
		}

		if (stream.match(/^@[-\w]*keyframes/i)) {
			state.tokenize.push(tokenExprUntilBrace)
			return 'at-rule'
		}

		if (stream.match(/^@[-\w]+/)) {
			state.tokenize.push(tokenRuleBlock)
			return 'at-rule'
		}

		if (stream.match(/^\*?[-\w{}$]*: /, false)) {
			state.tokenize.push(tokenProperty)
			return tokenProperty(stream, state)
		}

		state.tokenize.push(tokenSelectorUntilBrace)
		return tokenSelectorUntilBrace(stream, state)
	}

	function tokenWS(stream, state) {
		if (stream.eatSpace())
			return null

		return tokenComment(stream, state)
	}

	function tokenComment(stream, state) {
		if (stream.match('//')) {
			stream.skipToEnd()
			return 'comment'
		}

		if (stream.match(/\/\*/)) {
			state.tokenize.push(tokenInnerComment)
			return 'comment'
		}
	}

	function tokenInnerComment(stream, state) {
		if (stream.match(/^[\s\S]*?\*\//)) {
			state.tokenize.pop()
			return 'comment'
		}

		stream.skipToEnd()
		return 'comment'
	}


	function tokenExprUntilSemicolon(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(';') || stream.peek() === '}') {
			state.tokenize.pop()
			return null
		}

		return tokenValue(stream, state)
	}

	function tokenValue(stream, state) {
		return tokenComment(stream, state) ||
		       tokenString(stream, state) ||
		       tokenNumber(stream, state) ||
		       tokenOperator(stream, state) ||
		       tokenColor(stream, state) ||
		       tokenUrl(stream, state) ||
		       tokenFunction(stream, state) ||
		       tokenIdentifier(stream, state)
	}

	function tokenExprUntilParen(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(')')) {
			state.tokenize.pop()
			return null
		}

		return tokenValue(stream, state)
	}


	function tokenString(stream, state) {
		if (stream.match(/^'(?:[^'\\]|\\.)*'/))
			return 'string'

		if (stream.match(/^"(?:[^"\\]|\\.)*"/))
			return 'string'
	}

	function tokenNumber(stream, state) {
		if (stream.match(/^[-+]?(?:\d?\.\d+|\d+)(?:\w+|%)?/))
			return 'value'
	}

	function tokenOperator(stream, state) {
		if (stream.eat('/'))
			return 'operator'
	}

	function tokenColor(stream, state) {
		if (stream.match(/^#\w+/))
			return 'value'
	}

	function tokenUrl(stream, state) {
		if (stream.match(/^url\(/i)) {
			stream.backUp(1)
			state.tokenize.push(tokenUrlArg)
			return 'operator'
		}
	}

	function tokenUrlArg(stream, state) {
		if (stream.eat('('))
			return null

		if (stream.eat(')')) {
			state.tokenize.pop()
			return null
		}

		var style = tokenString(stream, state)
		if (style !== undefined)
			return style

		if (stream.match(/^[^)]+/))
			return 'string'
	}

	function tokenFunction(stream, state) {
		var style = tokenIdentifier(stream, state)
		if (style !== undefined && stream.peek() === '(') {
			if (style === 'value')
				style = 'operator'
			state.tokenize.push(tokenFunctionArg)
			return style
		}

		stream.backUp(stream.current().length)
	}

	function tokenFunctionArg(stream, state) {
		if (stream.eat('('))
			return null

		if (stream.eat(')')) {
			state.tokenize.pop()
			return null
		}

		return tokenValue(stream, state)
	}

	function tokenIdentifier(stream, state) {
		if (stream.match(/^[-\w]+/))
			return 'value'
	}

	function tokenExprUntilBrace(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('{')) {
			state.tokenize.pop()
			state.tokenize.push(tokenRule)
			return null
		}

		return tokenValue(stream, state)
	}

	function tokenMediaQueryUntilBrace(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('{')) {
			state.tokenize.pop()
			state.tokenize.push(tokenRule)
			return null
		}

		return tokenMediaQuery(stream, state)
	}

	function tokenMediaQuery(stream, state) {
		if (stream.eat('(')) {
			state.tokenize.push(tokenMediaFeature)
			return 'selector'
		}

		var style = tokenIdentifier(stream, state)
		if (style === 'value')
			return 'selector'
		return style
	}

	function tokenMediaFeature(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		var style = tokenIdentifier(stream, state)
		if (style !== undefined) {
			if (style === 'value')
				return 'selector'
			return style
		}

		if (stream.eat(':')) {
			state.tokenize.pop()
			state.tokenize.push(tokenMediaFeatureValue)
			return 'selector'
		}
	}

	function tokenMediaFeatureValue(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(')')) {
			state.tokenize.pop()
			return 'selector'
		}

		return tokenValue(stream, state)
	}

	function tokenImport(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (!state.importValueLexed) {
			state.importValueLexed = true
			return tokenValue(stream, state)
		}

		state.importValueLexed = false

		if (stream.eat(';')) {
			state.tokenize.pop()
			return null
		}

		state.tokenize.pop()
		state.tokenize.push(tokenMediaQueryUntilSemicolon)

		return tokenMediaQueryUntilSemicolon(stream, state)
	}

	function tokenMediaQueryUntilSemicolon(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(';') || stream.peek() === '}') {
			state.tokenize.pop()
			state.tokenize.push(tokenRule)
			return null
		}

		return tokenMediaQuery(stream, state)
	}

	function tokenRuleBlock(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('{')) {
			state.tokenize.pop()
			state.tokenize.push(tokenRule)
			return null
		}
	}

	function tokenProperty(stream, state) {
		if (stream.eat(':')) {
			state.tokenize.pop()
			state.tokenize.push(tokenExprUntilSemicolon)
			return null
		}

		if (stream.eat('*'))
			return 'property'

		var style = tokenIdentifier(stream, state)
		if (style === 'value')
			return 'property'
		return style
	}

	function tokenSelectorUntilBrace(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('{')) {
			state.tokenize.pop()
			state.tokenize.push(tokenRule)
			return null
		}

		return tokenSelector(stream, state)
	}

	function tokenSelectorUntilSemicolon(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(';')) {
			state.tokenize.pop()
			return null
		}

		return tokenSelector(stream, state)
	}

	function tokenSelector(stream, state) {
		if (stream.eat('&'))
			return 'operator'

		if (stream.eat(/[>+~*]/))
			return 'selector'

		if (stream.eat(/[#.]/))
			return tokenSelectorName(stream, state)

		if (stream.eat('[')) {
			state.tokenize.push(tokenAttrSelector)
			return 'selector'
		}

		if (stream.match(/^::?/))
			return tokenPseudoSelector(stream, state)

		return tokenSelectorName(stream, state)
	}

	function tokenSelectorName(stream, state) {
		var style = tokenIdentifier(stream, state)
		if (style === 'value')
			return 'selector'
		return style
	}

	function tokenAttrSelector(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat('=')) {
			state.tokenize.pop()
			state.tokenize.push(tokenAttrValueSelector)
			return 'selector'
		}

		var style = tokenIdentifier(stream, state)
		if (style !== undefined) {
			if (style === 'value')
				return 'selector'
			return style
		}
	}

	function tokenAttrValueSelector(stream, state) {
		var style = tokenWS(stream, state)
		if (style !== undefined)
			return style

		if (stream.eat(']')) {
			state.tokenize.pop()
			return 'selector'
		}

		return tokenValue(stream, state)
	}

	function tokenPseudoSelector(stream, state) {
		var style = tokenIdentifier(stream, state)
		if (style !== undefined) {
			if (style === 'value')
				style = 'selector'
			if (stream.eat('('))
				state.tokenize.push(tokenPseudoSelector)
			return style
		}
	}

	return {
		startState: function() {
			return {tokenize: [tokenRule]}
		},

		token: function(stream, state) {
			var tokenize = state.tokenize[state.tokenize.length - 1]
			var style = tokenize(stream, state)
			if (style === undefined)
				stream.next()
			return style
		}
	}
})