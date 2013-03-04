'use strict'

var assert = {}

assert.compileTo = function(imports, input, css, options) {
	var called = false

	if (typeof imports !== 'object') {
		options = css
		css = input
		input = imports
		imports = {}
	}

	if (!options)
		options = {}

	options.imports = imports
	options.prettyError = true

	roole.compile(input, options, function(error, output) {
		called = true

		if (error)
			throw error

		if (output !== css) {
			error = new Error('')
			error.actual = output
			error.expected = css

			output = output ? '\n"""\n' + output + '\n"""\n' : ' ' + output + '\n'
			css = css ? '\n"""\n' + css + '\n"""' : ' empty string'
			error.message = 'input compiled to' + output + 'instead of' + css

			throw error
		}
	})

	if (!called)
		throw new Error('input is never compiled')
}

assert.failAt = function(imports, input, line, column, filePath) {
	var called = false

	if (typeof imports !== 'object') {
		filePath = column
		column = line
		line = input
		input = imports
		imports = {}
	}

	if (!filePath)
		filePath = ''

	var options = {
		imports: imports,
		prettyError: true
	}

	roole.compile(input, options, function(error, css) {
		if (!error)
			throw new Error('no error is thrown')

		if (!error.line)
			throw error

		called = true

		if (error.line !== line) {
			var message = 'error has line number ' + error.line + ' instead of ' + line
			error.message = message + ':\n\n' + error.message
			throw error
		}

		if (error.column !== column) {
			var message = 'error has column number ' + error.column + ' instead of ' + column
			error.message = message + ':\n\n' + error.message
			throw error
		}

		if (error.filePath !== filePath) {
			var message = 'error has file path ' + error.filePath + ' instead of ' + filePath
			error.message = message + ':\n\n' + error.message
			throw error
		}
	})

	if (!called)
		throw new Error('input is never compiled')
}
suite('comment');

test('empty input', function() {
  return assert.compileTo('', '');
});

test('pure spaces input', function() {
  return assert.compileTo('  ', '');
});

test('single-line commnet', function() {
  return assert.compileTo('// before selector\nbody // selctor\n{\n// after selector\n	// before property\n	width: auto; // property\n	// after property\n// outdent\n	height: auto; // before eof\n}', 'body {\n	width: auto;\n	height: auto;\n}');
});

test('multi-line commnet', function() {
  return assert.compileTo('/* license */\n\nbody {\n/* after selector */\n	margin: 0;\n}', '/* license */\n\nbody {\n	margin: 0;\n}');
});

suite('selector');

test('simple selector', function() {
  return assert.compileTo('div {\n	width: auto;\n}', 'div {\n	width: auto;\n}');
});

test('compound selector', function() {
  return assert.compileTo('body div {\n	width: auto;\n}', 'body div {\n	width: auto;\n}');
});

test('selector list', function() {
  return assert.compileTo('div, p {\n	width: auto;\n}', 'div,\np {\n	width: auto;\n}');
});

test('nest selector under selector', function() {
  return assert.compileTo('body {\n	div {\n		width: auto;\n	}\n}', 'body div {\n	width: auto;\n}');
});

test('nest & selector under selector', function() {
  return assert.compileTo('body {\n	& {\n		width: auto;\n	}\n}', 'body {\n	width: auto;\n}');
});

test('nest selector containing & selector under selector', function() {
  return assert.compileTo('body {\n	html & {\n		width: auto;\n	}\n}', 'html body {\n	width: auto;\n}');
});

test('nest selector starting with combinator under selector', function() {
  return assert.compileTo('body {\n	> div {\n		width: auto;\n	}\n}', 'body > div {\n	width: auto;\n}');
});

test('nest selector list under selector', function() {
  return assert.compileTo('body div {\n	p, img {\n		width: auto;\n	}\n}', 'body div p,\nbody div img {\n	width: auto;\n}');
});

suite('property');

test('starred property', function() {
  return assert.compileTo('body {\n	*zoom: 1;\n}', 'body {\n	*zoom: 1;\n}');
});

test('!important', function() {
  return assert.compileTo('body {\n	width: auto !important;\n}', 'body {\n	width: auto !important;\n}');
});

test('without trailing semicolon', function() {
  return assert.compileTo('body {\n	margin: 0\n}', 'body {\n	margin: 0;\n}');
});

test('with multiple trailing semicolons', function() {
  return assert.compileTo('body {\n	margin: 0;;\n}', 'body {\n	margin: 0;\n}');
});

test('with multiple trailing ; interspersed with spaces', function() {
  return assert.compileTo('body {\n	margin: 0; ;\n}', 'body {\n	margin: 0;\n}');
});

test('with trailing ; and !important', function() {
  return assert.compileTo('body {\n	margin: 0 !important;\n}', 'body {\n	margin: 0 !important;\n}');
});

suite('ruleset');

test('remove empty ruleset', function() {
  return assert.compileTo('body {\n	$width = 980px;\n}', '');
});

suite('assignment');

test('variables are case-sensitive', function() {
  return assert.compileTo('$width = 960px;\n$Width = 480px;\nbody {\n	width: $width;\n}', 'body {\n	width: 960px;\n}');
});

test('?= after =', function() {
  return assert.compileTo('$width = 960px;\n$width ?= 480px;\nbody {\n	width: $width;\n}', 'body {\n	width: 960px;\n}');
});

test('lone ?= ', function() {
  return assert.compileTo('$width ?= 480px;\nbody {\n	width: $width;\n}', 'body {\n	width: 480px;\n}');
});

suite('identifier');

test('starting with a dash', function() {
  return assert.compileTo('body {\n	-webkit-box-sizing: border-box;\n}', 'body {\n	-webkit-box-sizing: border-box;\n}');
});

test('not allow starting with double-dash', function() {
  return assert.failAt('body {\n	--webkit-box-sizing: border-box;\n}', 2, 3);
});

test('interpolate identifier', function() {
  return assert.compileTo('$name = star;\n.icon-$name {\n	float: left;\n}', '.icon-star {\n	float: left;\n}');
});

test('interpolate number', function() {
  return assert.compileTo('$num = 12;\n.icon-$num {\n	float: left;\n}', '.icon-12 {\n	float: left;\n}');
});

test('interpolate string', function() {
  return assert.compileTo('$name = \'star\';\n.icon-$name {\n	float: left;\n}', '.icon-star {\n	float: left;\n}');
});

test('interpolate list', function() {
  return assert.compileTo('$name = star span;\n.icon-$name {\n	float: left;\n}', '.icon-star span {\n	float: left;\n}');
});

test('not allow interpolating mixin', function() {
  return assert.failAt('$name = @mixin {\n	body {\n		margin: auto;\n	}\n};\n.icon-$name {\n	float: left;\n}', 6, 7);
});

test('interpolate multiple variables', function() {
  return assert.compileTo('$size = big;\n$name = star;\n.icon-$size$name {\n	float: left;\n}', '.icon-bigstar {\n	float: left;\n}');
});

test('interpolation consists only two variables', function() {
  return assert.compileTo('$prop = border;\n$pos = -left;\nbody {\n	$prop$pos: solid;\n}', 'body {\n	border-left: solid;\n}');
});

test('braced interpolation', function() {
  return assert.compileTo('$prop = border;\nbody {\n	{$prop}: solid;\n}', 'body {\n	border: solid;\n}');
});

test('contain dangling dash', function() {
  return assert.compileTo('$prop = border;\n$pos = left;\nbody {\n	{$prop}-$pos: solid;\n}', 'body {\n	border-left: solid;\n}');
});

test('start with dangling dash', function() {
  return assert.compileTo('$prefix = moz;\n$prop = box-sizing;\nbody {\n	-{$prefix}-$prop: border-box;\n}', 'body {\n	-moz-box-sizing: border-box;\n}');
});

suite('string');

test('single-quoted string with escaped quote', function() {
  return assert.compileTo('a {\n	content: \'"a\\\'\';\n}', 'a {\n	content: \'"a\\\'\';\n}');
});

test('empty single-quoted string', function() {
  return assert.compileTo('a {\n	content: \'\';\n}', 'a {\n	content: \'\';\n}');
});

test('not interpolating single-quoted string', function() {
  return assert.compileTo('a {\n	content: \'a $var\';\n}', 'a {\n	content: \'a $var\';\n}');
});

test('double-quoted string with escaped quote', function() {
  return assert.compileTo('a {\n	content: "\'a0\\"";\n}', 'a {\n	content: "\'a0\\"";\n}');
});

test('empty double-quoted string', function() {
  return assert.compileTo('a {\n	content: "";\n}', 'a {\n	content: "";\n}');
});

test('interpolate identifier', function() {
  return assert.compileTo('$name = guest;\na {\n	content: "hello $name";\n}', 'a {\n	content: "hello guest";\n}');
});

test('interpolate single-quoted string', function() {
  return assert.compileTo('$name = \'guest\';\na {\n	content: "hello $name";\n}', 'a {\n	content: "hello guest";\n}');
});

test('interpolate double-quoted string', function() {
  return assert.compileTo('$name = "guest";\na {\n	content: "hello $name";\n}', 'a {\n	content: "hello guest";\n}');
});

test('interpolate list', function() {
  return assert.compileTo('$name = john doe;\na {\n	content: "hello $name";\n}', 'a {\n	content: "hello john doe";\n}');
});

test('not allow interpolating mixin', function() {
  return assert.failAt('$name = @mixin {\n	body {\n		margin: auto;\n	}\n};\na {\n	content: "hello $name";\n}', 7, 18);
});

test('contain braced variable', function() {
  return assert.compileTo('$chapter = 4;\nfigcaption {\n	content: "Figure {$chapter}-12";\n}', 'figcaption {\n	content: "Figure 4-12";\n}');
});

test('escape braced variable', function() {
  return assert.compileTo('figcaption {\n	content: "Figure \\{\\$chapter}-12";\n}', 'figcaption {\n	content: "Figure \\{\\$chapter}-12";\n}');
});

test('contain braces but not variable', function() {
  return assert.compileTo('$chapter = 4;\nfigcaption {\n	content: "Figure {chapter}-12";\n}', 'figcaption {\n	content: "Figure {chapter}-12";\n}');
});

test('escape double quotes', function() {
  return assert.compileTo('$str = \'"\\""\';\na {\n	content: "$str";\n}', 'a {\n	content: "\\"\\"\\"";\n}');
});

suite('number');

test('fraction', function() {
  return assert.compileTo('body {\n	line-height: 1.24;\n}', 'body {\n	line-height: 1.24;\n}');
});

test('fraction without whole number part', function() {
  return assert.compileTo('body {\n	line-height: .24;\n}', 'body {\n	line-height: 0.24;\n}');
});

suite('percentage');

test('percentage', function() {
  return assert.compileTo('body {\n	width: 33.33%;\n}', 'body {\n	width: 33.33%;\n}');
});

suite('dimension');

test('time', function() {
  return assert.compileTo('body {\n	-webkit-transition-duration: .24s;\n}', 'body {\n	-webkit-transition-duration: 0.24s;\n}');
});

suite('url()');

test('url contains protocol', function() {
  return assert.compileTo('a {\n	content: url(http://example.com/icon.png?size=small+big);\n}', 'a {\n	content: url(http://example.com/icon.png?size=small+big);\n}');
});

test('url is string', function() {
  return assert.compileTo('a {\n	content: url(\'icon.png\');\n}', 'a {\n	content: url(\'icon.png\');\n}');
});

suite('color');

test('3-digit #rgb', function() {
  return assert.compileTo('body {\n	color: #000;\n}', 'body {\n	color: #000;\n}');
});

test('6-digit #rgb', function() {
  return assert.compileTo('body {\n	color: #ff1234;\n}', 'body {\n	color: #ff1234;\n}');
});

suite('function');

test('single argument', function() {
  return assert.compileTo('a {\n	content: attr(href);\n}', 'a {\n	content: attr(href);\n}');
});

test('multiple arguments', function() {
  return assert.compileTo('a {\n	content: counters(item, \'.\');\n}', 'a {\n	content: counters(item, \'.\');\n}');
});

suite('list');

test('space-separated list', function() {
  return assert.compileTo('body {\n	margin: 10px 0 30px;\n}', 'body {\n	margin: 10px 0 30px;\n}');
});

test('comma-separated list', function() {
  return assert.compileTo('body {\n	font-family: font1, font2, font3;\n}', 'body {\n	font-family: font1, font2, font3;\n}');
});

test('slash-separated list', function() {
  return assert.compileTo('body {\n	font: 14px/1.2;\n}', 'body {\n	font: 14px/1.2;\n}');
});

test('mix-separated list', function() {
  return assert.compileTo('body {\n	font: normal 12px/1.25 font1, font2;\n}', 'body {\n	font: normal 12px/1.25 font1, font2;\n}');
});

suite('addition');

test('number + number', function() {
  return assert.compileTo('body {\n	-foo: 1 + 1;\n}', 'body {\n	-foo: 2;\n}');
});

test('number + percentage', function() {
  return assert.compileTo('body {\n	-foo: 1 + 1%;\n}', 'body {\n	-foo: 2%;\n}');
});

test('number + dimension', function() {
  return assert.compileTo('body {\n	-foo: 1 + 1px;\n}', 'body {\n	-foo: 2px;\n}');
});

test('number + mixin, not allowed', function() {
  return assert.failAt('$mixin = @mixin {\n	body {\n		margin: 0;\n	}\n};\nbody {\n	-foo: 1 + $mixin;\n}', 7, 8);
});

test('number + string', function() {
  return assert.compileTo('body {\n	-foo: 1 + \'str\';\n}', 'body {\n	-foo: \'1str\';\n}');
});

test('percentage + number', function() {
  return assert.compileTo('body {\n	-foo: 1% + 1;\n}', 'body {\n	-foo: 2%;\n}');
});

test('percentage + percentage', function() {
  return assert.compileTo('body {\n	-foo: 1% + 1%;\n}', 'body {\n	-foo: 2%;\n}');
});

test('percentage + dimension', function() {
  return assert.compileTo('body {\n	-foo: 2% + 1px;\n}', 'body {\n	-foo: 3%;\n}');
});

test('percentage + string', function() {
  return assert.compileTo('body {\n	-foo: 2% + \'str\';\n}', 'body {\n	-foo: \'2%str\';\n}');
});

test('dimension + number', function() {
  return assert.compileTo('body {\n	-foo: 1px + 1;\n}', 'body {\n	-foo: 2px;\n}');
});

test('dimension + dimension', function() {
  return assert.compileTo('body {\n	-foo: 1px + 1px;\n}', 'body {\n	-foo: 2px;\n}');
});

test('dimension + dimension, different units', function() {
  return assert.compileTo('body {\n	-foo: 1em + 1px;\n}', 'body {\n	-foo: 2em;\n}');
});

test('dimension + identifier', function() {
  return assert.compileTo('body {\n	-foo: 1px + id;\n}', 'body {\n	-foo: 1pxid;\n}');
});

test('dimension + string', function() {
  return assert.compileTo('body {\n	-foo: 1px + \'str\';\n}', 'body {\n	-foo: \'1pxstr\';\n}');
});

test('boolean + identifier', function() {
  return assert.compileTo('body {\n	-foo: true + id;\n}', 'body {\n	-foo: trueid;\n}');
});

test('boolean + string', function() {
  return assert.compileTo('body {\n	-foo: true + \'str\';\n}', 'body {\n	-foo: \'truestr\';\n}');
});

test('identifier + number', function() {
  return assert.compileTo('body {\n	-foo: id + 1;\n}', 'body {\n	-foo: id1;\n}');
});

test('identifier + identifier', function() {
  return assert.compileTo('body {\n	-foo: -webkit + -moz;\n}', 'body {\n	-foo: -webkit-moz;\n}');
});

test('identifier + dimension', function() {
  return assert.compileTo('body {\n	-foo: id + 1px;\n}', 'body {\n	-foo: id1px;\n}');
});

test('identifier + boolean', function() {
  return assert.compileTo('body {\n	-foo: id + true;\n}', 'body {\n	-foo: idtrue;\n}');
});

test('identifier + str', function() {
  return assert.compileTo('body {\n	-foo: id + \'str\';\n}', 'body {\n	-foo: \'idstr\';\n}');
});

test('string + number', function() {
  return assert.compileTo('body {\n	-foo: \'str\' + 1;\n}', 'body {\n	-foo: \'str1\';\n}');
});

test('string + percentage', function() {
  return assert.compileTo('body {\n	-foo: \'str\' + 1%;\n}', 'body {\n	-foo: \'str1%\';\n}');
});

test('string + dimension', function() {
  return assert.compileTo('body {\n	-foo: \'str\' + 1px;\n}', 'body {\n	-foo: \'str1px\';\n}');
});

test('string + boolean', function() {
  return assert.compileTo('body {\n	-foo: \'str\' + false;\n}', 'body {\n	-foo: \'strfalse\';\n}');
});

test('string + identifier', function() {
  return assert.compileTo('body {\n	-foo: \'str\' + id;\n}', 'body {\n	-foo: \'strid\';\n}');
});

test('string + string', function() {
  return assert.compileTo('body {\n	-foo: \'foo\' + \'bar\';\n}', 'body {\n	-foo: \'foobar\';\n}');
});

test('string + string, different quotes', function() {
  return assert.compileTo('body {\n	-foo: "foo" + \'bar\';\n}', 'body {\n	-foo: "foobar";\n}');
});

test('number+number', function() {
  return assert.compileTo('body {\n	-foo: 1+1;\n}', 'body {\n	-foo: 2;\n}');
});

test('number+ number', function() {
  return assert.compileTo('body {\n	-foo: 1+ 1;\n}', 'body {\n	-foo: 2;\n}');
});

suite('subtraction');

test('number - number', function() {
  return assert.compileTo('body {\n	-foo: 1 - 1;\n}', 'body {\n	-foo: 0;\n}');
});

test('number - percentage', function() {
  return assert.compileTo('body {\n	-foo: 1 - 1%;\n}', 'body {\n	-foo: 0%;\n}');
});

test('number - dimension', function() {
  return assert.compileTo('body {\n	-foo: 1 - 2px;\n}', 'body {\n	-foo: -1px;\n}');
});

test('percentage - number', function() {
  return assert.compileTo('body {\n	-foo: 1% - 2;\n}', 'body {\n	-foo: -1%;\n}');
});

test('percentage - percentage', function() {
  return assert.compileTo('body {\n	-foo: 1% - 1%;\n}', 'body {\n	-foo: 0%;\n}');
});

test('percentage - dimension', function() {
  return assert.compileTo('body {\n	-foo: 1% - 2px;\n}', 'body {\n	-foo: -1%;\n}');
});

test('dimension - number', function() {
  return assert.compileTo('body {\n	-foo: 1px - 1;\n}', 'body {\n	-foo: 0px;\n}');
});

test('dimension - dimension', function() {
  return assert.compileTo('body {\n	-foo: 1px - 1px;\n}', 'body {\n	-foo: 0px;\n}');
});

test('dimension - dimension, different units', function() {
  return assert.compileTo('body {\n	-foo: 1em - 2px;\n}', 'body {\n	-foo: -1em;\n}');
});

test('number-number', function() {
  return assert.compileTo('body {\n	-foo: 1-1;\n}', 'body {\n	-foo: 0;\n}');
});

test('number- number', function() {
  return assert.compileTo('body {\n	-foo: 1- 1;\n}', 'body {\n	-foo: 0;\n}');
});

suite('multiplication');

test('number * number', function() {
  return assert.compileTo('body {\n	-foo: 1 * 2;\n}', 'body {\n	-foo: 2;\n}');
});

test('number * percentage', function() {
  return assert.compileTo('body {\n	-foo: 2 * 1%;\n}', 'body {\n	-foo: 2%;\n}');
});

test('number * dimension', function() {
  return assert.compileTo('body {\n	-foo: 1 * 2px;\n}', 'body {\n	-foo: 2px;\n}');
});

test('percentage * number', function() {
  return assert.compileTo('body {\n	-foo: 1% * 2;\n}', 'body {\n	-foo: 2%;\n}');
});

test('percentage * percentage', function() {
  return assert.compileTo('body {\n	-foo: 1% * 1%;\n}', 'body {\n	-foo: 1%;\n}');
});

test('percentage * dimension', function() {
  return assert.compileTo('body {\n	-foo: 1% * 2px;\n}', 'body {\n	-foo: 2%;\n}');
});

test('dimension * number', function() {
  return assert.compileTo('body {\n	-foo: 1px * 1;\n}', 'body {\n	-foo: 1px;\n}');
});

test('dimension * dimension', function() {
  return assert.compileTo('body {\n	-foo: 1px * 1px;\n}', 'body {\n	-foo: 1px;\n}');
});

test('dimension * dimension, different units', function() {
  return assert.compileTo('body {\n	-foo: 1em * 2px;\n}', 'body {\n	-foo: 2em;\n}');
});

test('number*number', function() {
  return assert.compileTo('body {\n	-foo: 1*2;\n}', 'body {\n	-foo: 2;\n}');
});

test('number* number', function() {
  return assert.compileTo('body {\n	-foo: 1* 2;\n}', 'body {\n	-foo: 2;\n}');
});

test('number *number', function() {
  return assert.compileTo('body {\n	-foo: 1 *2;\n}', 'body {\n	-foo: 2;\n}');
});

suite('division');

test('number / number', function() {
  return assert.compileTo('body {\n	-foo: 1 / 2;\n}', 'body {\n	-foo: 0.5;\n}');
});

test('number / 0, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1 / 0;\n}', 2, 12);
});

test('number / number, result in fraction', function() {
  return assert.compileTo('body {\n	-foo: 1 / 3;\n}', 'body {\n	-foo: 0.333;\n}');
});

test('number / percentage', function() {
  return assert.compileTo('body {\n	-foo: 2 / 1%;\n}', 'body {\n	-foo: 2%;\n}');
});

test('number / 0%, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1 / 0%;\n}', 2, 12);
});

test('number / dimension', function() {
  return assert.compileTo('body {\n	-foo: 1 / 2px;\n}', 'body {\n	-foo: 0.5px;\n}');
});

test('number / 0px, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1 / 0px;\n}', 2, 12);
});

test('percentage / number', function() {
  return assert.compileTo('body {\n	-foo: 1% / 2;\n}', 'body {\n	-foo: 0.5%;\n}');
});

test('percentage / 0, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1% / 0;\n}', 2, 13);
});

test('percentage / percentage', function() {
  return assert.compileTo('body {\n	-foo: 1% / 1%;\n}', 'body {\n	-foo: 1%;\n}');
});

test('percentage / 0%, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1% / 0%;\n}', 2, 13);
});

test('percentage / dimension', function() {
  return assert.compileTo('body {\n	-foo: 1% / 2px;\n}', 'body {\n	-foo: 0.5%;\n}');
});

test('percentage / 0px, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1% / 0px;\n}', 2, 13);
});

test('dimension / number', function() {
  return assert.compileTo('body {\n	-foo: 1px / 1;\n}', 'body {\n	-foo: 1px;\n}');
});

test('dimension / 0, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1px / 0;\n}', 2, 14);
});

test('dimension / percentage', function() {
  return assert.compileTo('body {\n	-foo: 1px / 2%;\n}', 'body {\n	-foo: 0.5px;\n}');
});

test('dimension / 0%, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1px / 0%;\n}', 2, 14);
});

test('dimension / dimension', function() {
  return assert.compileTo('body {\n	-foo: 1px / 1px;\n}', 'body {\n	-foo: 1px;\n}');
});

test('dimension / dimension, different units', function() {
  return assert.compileTo('body {\n	-foo: 1em / 2px;\n}', 'body {\n	-foo: 0.5em;\n}');
});

test('dimension / 0px, not allowed', function() {
  return assert.failAt('body {\n	-foo: 1px / 0px;\n}', 2, 14);
});

test('number/ number', function() {
  return assert.compileTo('body {\n	-foo: 1/ 2;\n}', 'body {\n	-foo: 0.5;\n}');
});

test('number /number', function() {
  return assert.compileTo('body {\n	-foo: 1 /2;\n}', 'body {\n	-foo: 0.5;\n}');
});

suite('relational');

test('number < number', function() {
  return assert.compileTo('body {\n	-foo: 1 < 2;\n}', 'body {\n	-foo: true;\n}');
});

test('number <= number', function() {
  return assert.compileTo('body {\n	-foo: 2 <= 2;\n}', 'body {\n	-foo: true;\n}');
});

test('number > number', function() {
  return assert.compileTo('body {\n	-foo: 2 > 2;\n}', 'body {\n	-foo: false;\n}');
});

test('number >= number', function() {
  return assert.compileTo('body {\n	-foo: 2 >= 3;\n}', 'body {\n	-foo: false;\n}');
});

test('number >= identifer', function() {
  return assert.compileTo('body {\n	-foo: 2 >= abc;\n}', 'body {\n	-foo: false;\n}');
});

test('identifer < number', function() {
  return assert.compileTo('body {\n	-foo: abc < 2;\n}', 'body {\n	-foo: false;\n}');
});

test('identifier < identifier', function() {
  return assert.compileTo('body {\n	-foo: a < b;\n}', 'body {\n	-foo: true;\n}');
});

test('string > string', function() {
  return assert.compileTo('body {\n	-foo: \'b\' > \'a\';\n}', 'body {\n	-foo: true;\n}');
});

suite('equality');

test('is, true', function() {
  return assert.compileTo('body {\n	-foo: 1 is 1;\n}', 'body {\n	-foo: true;\n}');
});

test('is, false', function() {
  return assert.compileTo('body {\n	-foo: 1 is 2;\n}', 'body {\n	-foo: false;\n}');
});

test('isnt, true', function() {
  return assert.compileTo('body {\n	-foo: 1 isnt 2;\n}', 'body {\n	-foo: true;\n}');
});

test('isnt, false', function() {
  return assert.compileTo('body {\n	-foo: 1 isnt 1;\n}', 'body {\n	-foo: false;\n}');
});

test('inclusive range isnt exclusive range', function() {
  return assert.compileTo('body {\n	-foo: 1..2 isnt 1...2;\n}', 'body {\n	-foo: true;\n}');
});

suite('logical');

test('true and false', function() {
  return assert.compileTo('body {\n	-foo: true and false;\n}', 'body {\n	-foo: false;\n}');
});

test('true and true', function() {
  return assert.compileTo('body {\n	-foo: true and true;\n}', 'body {\n	-foo: true;\n}');
});

test('false and true', function() {
  return assert.compileTo('body {\n	-foo: false and true;\n}', 'body {\n	-foo: false;\n}');
});

test('false and false', function() {
  return assert.compileTo('body {\n	-foo: false and false;\n}', 'body {\n	-foo: false;\n}');
});

test('true or false', function() {
  return assert.compileTo('body {\n	-foo: true or false;\n}', 'body {\n	-foo: true;\n}');
});

test('true or true', function() {
  return assert.compileTo('body {\n	-foo: true or true;\n}', 'body {\n	-foo: true;\n}');
});

test('false or true', function() {
  return assert.compileTo('body {\n	-foo: false or true;\n}', 'body {\n	-foo: true;\n}');
});

test('false or false', function() {
  return assert.compileTo('body {\n	-foo: false or false;\n}', 'body {\n	-foo: false;\n}');
});

test('true and false or true', function() {
  return assert.compileTo('body {\n	-foo: true and false or true;\n}', 'body {\n	-foo: true;\n}');
});

suite('range');

test('natural range', function() {
  return assert.compileTo('body {\n	-foo: 1..3;\n}', 'body {\n	-foo: 1 2 3;\n}');
});

test('natural exclusive range', function() {
  return assert.compileTo('body {\n	-foo: 1...3;\n}', 'body {\n	-foo: 1 2;\n}');
});

test('reversed range', function() {
  return assert.compileTo('body {\n	-foo: 3..1;\n}', 'body {\n	-foo: 3 2 1;\n}');
});

test('reversed exclusive range', function() {
  return assert.compileTo('body {\n	-foo: 3...1;\n}', 'body {\n	-foo: 3 2;\n}');
});

test('one number range', function() {
  return assert.compileTo('body {\n	-foo: 1..1;\n}', 'body {\n	-foo: 1;\n}');
});

test('empty range', function() {
  return assert.compileTo('body {\n	-foo: 1...1;\n}', 'body {\n	-foo: null;\n}');
});

test('percentage range', function() {
  return assert.compileTo('body {\n	-foo: 0%..2%;\n}', 'body {\n	-foo: 0% 1% 2%;\n}');
});

test('dimension range', function() {
  return assert.compileTo('body {\n	-foo: 100px..102px;\n}', 'body {\n	-foo: 100px 101px 102px;\n}');
});

test('mixed range', function() {
  return assert.compileTo('body {\n	-foo: 1px..3%;\n}', 'body {\n	-foo: 1px 2px 3px;\n}');
});

test('start number must be numberic', function() {
  return assert.failAt('body {\n	-foo: a...3;\n}', 2, 8);
});

test('end number must be numberic', function() {
  return assert.failAt('body {\n	-foo: 1..b;\n}', 2, 11);
});

suite('unary');

test('+number', function() {
  return assert.compileTo('body {\n	-foo: +1;\n}', 'body {\n	-foo: 1;\n}');
});

test('+percentage', function() {
  return assert.compileTo('body {\n	-foo: +1%;\n}', 'body {\n	-foo: 1%;\n}');
});

test('+dimension', function() {
  return assert.compileTo('body {\n	-foo: +1px;\n}', 'body {\n	-foo: 1px;\n}');
});

test('+string, not allowed', function() {
  return assert.failAt('body {\n	-foo: +\'a\';\n}', 2, 8);
});

test('-number', function() {
  return assert.compileTo('body {\n	-foo: -1;\n}', 'body {\n	-foo: -1;\n}');
});

test('-percentage', function() {
  return assert.compileTo('body {\n	-foo: -1%;\n}', 'body {\n	-foo: -1%;\n}');
});

test('-dimension', function() {
  return assert.compileTo('body {\n	-foo: -1px;\n}', 'body {\n	-foo: -1px;\n}');
});

suite('expression');

test('number + number - number', function() {
  return assert.compileTo('body {\n	-foo: 1 + 2 - 1;\n}', 'body {\n	-foo: 2;\n}');
});

test('number / number * number', function() {
  return assert.compileTo('body {\n	-foo: 1 / 2 * -3;\n}', 'body {\n	-foo: -1.5;\n}');
});

test('number + number * number', function() {
  return assert.compileTo('body {\n	-foo: 1 + 2 * 3;\n}', 'body {\n	-foo: 7;\n}');
});

test('(number + number) * number', function() {
  return assert.compileTo('body {\n	-foo: (1 + 2) * 3;\n}', 'body {\n	-foo: 9;\n}');
});

test('number > number is boolean', function() {
  return assert.compileTo('body {\n	-foo: -1 > 1 is false;\n}', 'body {\n	-foo: true;\n}');
});

test('number + number .. number * number', function() {
  return assert.compileTo('body {\n	-foo: 1 + 1 .. 2 * 2;\n}', 'body {\n	-foo: 2 3 4;\n}');
});

test('list containing empty range', function() {
  return assert.compileTo('body {\n	-foo: 3 1 + 1 ... 1 * 2;\n}', 'body {\n	-foo: 3 null;\n}');
});

suite('media query');

test('media type', function() {
  return assert.compileTo('@media print {\n	body {\n		width: auto;\n	}\n}', '@media print {\n	body {\n		width: auto;\n	}\n}');
});

test('media type with prefix', function() {
  return assert.compileTo('@media not screen {\n	body {\n		width: auto;\n	}\n}', '@media not screen {\n	body {\n		width: auto;\n	}\n}');
});

test('media feature', function() {
  return assert.compileTo('@media (max-width: 980px) {\n	body {\n		width: auto;\n	}\n}', '@media (max-width: 980px) {\n	body {\n		width: auto;\n	}\n}');
});

test('media feature without value', function() {
  return assert.compileTo('@media (color) {\n	body {\n		width: auto;\n	}\n}', '@media (color) {\n	body {\n		width: auto;\n	}\n}');
});

test('media query', function() {
  return assert.compileTo('@media only screen and (color) {\n	body {\n		width: auto;\n	}\n}', '@media only screen and (color) {\n	body {\n		width: auto;\n	}\n}');
});

test('nest media query under media query', function() {
  return assert.compileTo('@media screen {\n	@media (color) {\n		body {\n			width: auto;\n		}\n	}\n}', '@media screen and (color) {\n	body {\n		width: auto;\n	}\n}');
});

test('nest media query list under media query', function() {
  return assert.compileTo('@media screen {\n	@media (max-width: 980px), (max-width: 560px) {\n		body {\n			width: auto;\n		}\n	}\n}', '@media\nscreen and (max-width: 980px),\nscreen and (max-width: 560px) {\n	body {\n		width: auto;\n	}\n}');
});

test('nest media query under media query list', function() {
  return assert.compileTo('@media screen, print {\n	@media (max-width: 980px) {\n		body {\n			width: auto;\n		}\n	}\n}', '@media\nscreen and (max-width: 980px),\nprint and (max-width: 980px) {\n	body {\n		width: auto;\n	}\n}');
});

test('nest media query list under media query list', function() {
  return assert.compileTo('@media screen, print {\n	@media (max-width: 980px), (max-width: 560px) {\n		body {\n			width: auto;\n		}\n	}\n}', '@media\nscreen and (max-width: 980px),\nscreen and (max-width: 560px),\nprint and (max-width: 980px),\nprint and (max-width: 560px) {\n	body {\n		width: auto;\n	}\n}');
});

test('deeply nest media query', function() {
  return assert.compileTo('@media screen {\n	body {\n		width: auto;\n		@media (color) {\n			@media (monochrome) {\n				height: auto;\n			}\n		}\n\n		div {\n			height: auto;\n		}\n	}\n\n	@media (monochrome) {\n		p {\n			margin: 0;\n		}\n	}\n}', '@media screen {\n	body {\n		width: auto;\n	}\n		body div {\n			height: auto;\n		}\n}\n	@media screen and (color) and (monochrome) {\n		body {\n			height: auto;\n		}\n	}\n	@media screen and (monochrome) {\n		p {\n			margin: 0;\n		}\n	}');
});

test('interpolating media query', function() {
  return assert.compileTo('$qry = \'not  screen\';\n@media $qry {\n	body {\n		width: auto;\n	}\n}', '@media not screen {\n	body {\n		width: auto;\n	}\n}');
});

test('interpolating media query into media query', function() {
  return assert.compileTo('$qry = \'( max-width: 980px )\';\n@media screen and $qry {\n	body {\n		width: auto;\n	}\n}', '@media screen and (max-width: 980px) {\n	body {\n		width: auto;\n	}\n}');
});

test('interpolating media query into media query list', function() {
  return assert.compileTo('$qry1 = \' only screen  and (max-width: 980px) \';\n$qry2 = \'(max-width: 560px)\';\n@media $qry1, $qry2 {\n	body {\n		width: auto;\n	}\n}', '@media\nonly screen and (max-width: 980px),\n(max-width: 560px) {\n	body {\n		width: auto;\n	}\n}');
});

test('interpolating identifier', function() {
  return assert.compileTo('$qry = screen;\n@media $qry {\n	body {\n		width: auto;\n	}\n}', '@media screen {\n	body {\n		width: auto;\n	}\n}');
});

test('not allow interpolating invalid media query', function() {
  return assert.failAt('$qry = \'screen @\';\n@media $qry {\n	body {\n		width: auto;\n	}\n}', 2, 8);
});

test('allow nesting media type', function() {
  return assert.compileTo('@media screen {\n	@media not print {\n		body {\n			width: auto;\n		}\n	}\n}', '@media screen and not print {\n	body {\n		width: auto;\n	}\n}');
});

suite('@media');

test('not allow containing properties at root level', function() {
  return assert.failAt('@media screen {\n	width: auto;\n}', 1, 1);
});

test('nest inside ruleset', function() {
  return assert.compileTo('body {\n	@media screen {\n		width: auto;\n	}\n}', '@media screen {\n	body {\n		width: auto;\n	}\n}');
});

test('remove empty @media', function() {
  return assert.compileTo('@media screen {\n	body {\n		$width = 980px;\n	}\n}', '');
});

suite('@import');

test('import with string', function() {
  return assert.compileTo({
    'base.roo': 'body {\n	margin: 0;\n}'
  }, '@import \'base\';', 'body {\n	margin: 0;\n}');
});

test('import with url()', function() {
  return assert.compileTo('@import url(base);', '@import url(base);');
});

test('import with url starting with protocol', function() {
  return assert.compileTo('@import \'http://example.com/style\';', '@import \'http://example.com/style\';');
});

test('import with media query', function() {
  return assert.compileTo('@import \'base\' screen;', '@import \'base\' screen;');
});

test('nest under ruleset', function() {
  return assert.compileTo({
    'base.roo': 'body {\n	margin: 0;\n}'
  }, 'html {\n	@import \'base\';\n}', 'html body {\n	margin: 0;\n}');
});

test('recursively import', function() {
  return assert.compileTo({
    'reset.roo': 'body {\n	margin: 0;\n}',
    'button.roo': '@import \'reset\';\n\n.button {\n	display: inline-block;\n}'
  }, '@import \'button\';', 'body {\n	margin: 0;\n}\n\n.button {\n	display: inline-block;\n}');
});

test('import same file multiple times', function() {
  return assert.compileTo({
    'reset.roo': 'body {\n	margin: 0;\n}',
    'button.roo': '@import \'reset\';\n\n.button {\n	display: inline-block;\n}',
    'tabs.roo': '@import \'reset\';\n\n.tabs {\n	overflow: hidden;\n}'
  }, '@import \'button\';\n@import \'tabs\';', 'body {\n	margin: 0;\n}\n\n.button {\n	display: inline-block;\n}\n\n.tabs {\n	overflow: hidden;\n}');
});

test('recursively import files of the same directory', function() {
  return assert.compileTo({
    'tabs/tab.roo': '.tab {\n	float: left;\n}',
    'tabs/index.roo': '@import \'tab\';\n\n.tabs {\n	overflow: hidden;\n}'
  }, '@import \'tabs/index\';', '.tab {\n	float: left;\n}\n\n.tabs {\n	overflow: hidden;\n}');
});

test('recursively import files of different directories', function() {
  return assert.compileTo({
    'reset.roo': 'body {\n	margin: 0;\n}',
    'tabs/index.roo': '@import \'../reset\';\n\n.tabs {\n	overflow: hidden;\n}'
  }, '@import \'tabs/index\';', 'body {\n	margin: 0;\n}\n\n.tabs {\n	overflow: hidden;\n}');
});

test('import empty file', function() {
  return assert.compileTo({
    'var.roo': '$width = 980px;'
  }, '@import \'var\';\n\nbody {\n	width: $width;\n}', 'body {\n	width: 980px;\n}');
});

test('not importing file with variables in the path', function() {
  return assert.compileTo('$path = \'tabs\';\n@import $path;', '@import \'tabs\';');
});

test('not allow importing file has syntax error', function() {
  return assert.failAt({
    'base.roo': 'body # {\n	margin: 0;\n}'
  }, '@import \'base\';', 1, 7, 'base.roo');
});

suite('@extend');

test('extend selector', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n#submit {\n	@extend .button;\n}', '.button,\n#submit {\n	display: inline-block;\n}');
});

test('ignore following selectors', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n#submit {\n	@extend .button;\n}\n\n.button {\n	display: block;\n}', '.button,\n#submit {\n	display: inline-block;\n}\n\n.button {\n	display: block;\n}');
});

test('extend selector containing nested selector', function() {
  return assert.compileTo('.button {\n	.icon {\n		display:block;\n	}\n}\n\n#submit {\n	@extend .button;\n}', '.button .icon,\n#submit .icon {\n	display: block;\n}');
});

test('extend selector containing deeply nested selector', function() {
  return assert.compileTo('.button {\n	.icon {\n		img {\n			display:block;\n		}\n	}\n}\n\n#submit {\n	@extend .button;\n}', '.button .icon img,\n#submit .icon img {\n	display: block;\n}');
});

test('extend compound selector', function() {
  return assert.compileTo('.button {\n	& .icon {\n		float: left;\n	}\n}\n\n#submit .icon {\n	@extend .button .icon;\n}', '.button .icon,\n#submit .icon {\n	float: left;\n}');
});

test('extend selector containing nested & selector', function() {
  return assert.compileTo('.button {\n	& .icon {\n		float: left;\n	}\n}\n\n#submit {\n	@extend .button;\n}', '.button .icon,\n#submit .icon {\n	float: left;\n}');
});

test('extend selector with selector list', function() {
  return assert.compileTo('.button .icon {\n	float: left;\n}\n\n#submit .icon, #reset .icon {\n	@extend .button .icon;\n}', '.button .icon,\n#submit .icon,\n#reset .icon {\n	float: left;\n}');
});

test('deeply extend selector', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n.large-button {\n	@extend .button;\n	display: block;\n}\n\n#submit {\n	@extend .large-button;\n}', '.button,\n.large-button,\n#submit {\n	display: inline-block;\n}\n\n.large-button,\n#submit {\n	display: block;\n}');
});

test('extend selector under the same ruleset', function() {
  return assert.compileTo('.button {\n	.icon {\n		float: left;\n	}\n\n	.large-icon {\n		@extend .button .icon;\n	}\n}', '.button .icon,\n.button .large-icon {\n	float: left;\n}');
});

test('extend self', function() {
  return assert.compileTo('.button {\n	.icon {\n		float: left;\n	}\n\n	.icon {\n		@extend .button .icon;\n		display: block;\n	}\n}', '.button .icon,\n.button .icon {\n	float: left;\n}\n\n.button .icon,\n.button .icon {\n	display: block;\n}');
});

test('extend by multiple selectors', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n#submit {\n	@extend .button;\n}\n\n#reset {\n	@extend .button;\n}', '.button,\n#submit,\n#reset {\n	display: inline-block;\n}');
});

test('extend selector containing selector by multiple selectors', function() {
  return assert.compileTo('.button {\n	.icon {\n		float: left;\n	}\n}\n\n#submit {\n	@extend .button;\n}\n\n#reset {\n	@extend .button;\n}', '.button .icon,\n#submit .icon,\n#reset .icon {\n	float: left;\n}');
});

test('extend selector containg nested @media', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n	@media screen {\n		display: block;\n	}\n	@media print {\n		display: none;\n	}\n}\n\n#submit {\n	@extend .button;\n}', '.button,\n#submit {\n	display: inline-block;\n}\n	@media screen {\n		.button,\n		#submit {\n			display: block;\n		}\n	}\n	@media print {\n		.button,\n		#submit {\n			display: none;\n		}\n	}');
});

test('extend selector nested under same @media', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n@media print {\n	.button {\n		display: block;\n	}\n}\n\n@media not screen {\n	.button {\n		display: block;\n	}\n\n	#submit {\n		@extend .button;\n	}\n}', '.button {\n	display: inline-block;\n}\n\n@media print {\n	.button {\n		display: block;\n	}\n}\n\n@media not screen {\n	.button,\n	#submit {\n		display: block;\n	}\n}');
});

test('extend selector nested under @media with same media query', function() {
  return assert.compileTo('@media screen {\n	.button {\n		display: inline-block;\n	}\n\n	@media (color), (monochrome) {\n		.button {\n			display: block;\n		}\n	}\n\n	@media (color) {\n		.button {\n			display: inline-block;\n		}\n	}\n}\n\n@media screen and (color) {\n	#submit {\n		@extend .button;\n	}\n}', '@media screen {\n	.button {\n		display: inline-block;\n	}\n}\n	@media\n	screen and (color),\n	screen and (monochrome) {\n		.button {\n			display: block;\n		}\n	}\n	@media screen and (color) {\n		.button,\n		#submit {\n			display: inline-block;\n		}\n	}');
});

test('ignore following @media', function() {
  return assert.compileTo('@media screen and (color) {\n	.button {\n		display: inline-block;\n	}\n}\n\n@media screen and (color) {\n	#submit {\n		@extend .button;\n	}\n}\n\n@media screen and (color) {\n	.button {\n		display: block;\n	}\n}', '@media screen and (color) {\n	.button,\n	#submit {\n		display: inline-block;\n	}\n}\n\n@media screen and (color) {\n	.button {\n		display: block;\n	}\n}');
});

test('extend selector in the imported file', function() {
  return assert.compileTo({
    'button.roo': '.button {\n	display: inline-block;\n}'
  }, '@import \'button\';\n\n#submit {\n	@extend .button;\n}', '.button,\n#submit {\n	display: inline-block;\n}');
});

test('not extending selector in the importing file', function() {
  return assert.compileTo({
    'button.roo': '#submit {\n	@extend .button;\n	display: block;\n}'
  }, '.button {\n	display: inline-block;\n}\n\n@import \'button\';', '.button {\n	display: inline-block;\n}\n\n#submit {\n	display: block;\n}');
});

suite('@extend-all');

test('extend simple selector', function() {
  return assert.compileTo('.button.active {\n	display: inline-block;\n}\n\n#submit {\n	@extend-all .button;\n	border: 1px solid;\n}', '.button.active,\n#submit.active {\n	display: inline-block;\n}\n\n#submit {\n	border: 1px solid;\n}');
});

test('extend multiple simple selectors', function() {
  return assert.compileTo('.menu .menu {\n	position: absolute;\n}\n\n.my-menu {\n	@extend-all .menu;\n}', '.menu .menu,\n.my-menu .my-menu {\n	position: absolute;\n}');
});

test('extend compond selector', function() {
  return assert.compileTo('.button.active .icon {\n	float: left;\n}\n\n#submit {\n	@extend-all .button;\n}', '.button.active .icon,\n#submit.active .icon {\n	float: left;\n}');
});

test('extend selector list', function() {
  return assert.compileTo('.button.active .icon,\n.tab.active .icon {\n	float: left;\n}\n\n#submit {\n	@extend-all .button;\n}', '.button.active .icon,\n.tab.active .icon,\n#submit.active .icon {\n	float: left;\n}');
});

suite('@void');

test('unextended ruleset', function() {
  return assert.compileTo('@void {\n	body {\n		width: auto;\n	}\n}', '');
});

test('extended ruleset', function() {
  return assert.compileTo('@void {\n	.button {\n		display: inline-block;\n	}\n}\n\n#submit {\n	@extend .button;\n}', '#submit {\n	display: inline-block;\n}');
});

test('extend ruleset inside @void', function() {
  return assert.compileTo('@void {\n	.button {\n		display: inline-block;\n		.icon {\n			float: left;\n		}\n	}\n\n	.large-button {\n		@extend .button;\n		display: block;\n	}\n}\n\n#submit {\n	@extend .large-button;\n}', '#submit {\n	display: inline-block;\n}\n	#submit .icon {\n		float: left;\n	}\n\n#submit {\n	display: block;\n}');
});

test('extend ruleset outside @void has no effect', function() {
  return assert.compileTo('.button {\n	display: inline-block;\n}\n\n@void {\n	.button {\n		display: block;\n	}\n\n	.large-button {\n		@extend .button;\n	}\n}\n\n#submit {\n	@extend .large-button;\n}', '.button {\n	display: inline-block;\n}\n\n#submit {\n	display: block;\n}');
});

test('nest @import under @void', function() {
  return assert.compileTo({
    'button.roo': '.button {\n	display: inline-block;\n}\n\n.large-button {\n	@extend .button;\n	width: 100px;\n}'
  }, '@void {\n	@import \'button\';\n}\n\n#submit {\n	@extend .large-button;\n}', '#submit {\n	display: inline-block;\n}\n\n#submit {\n	width: 100px;\n}');
});

suite('@if');

test('true condition', function() {
  return assert.compileTo('@if true {\n	body {\n		width: auto;\n	}\n}', 'body {\n	width: auto;\n}');
});

test('list as true condition', function() {
  return assert.compileTo('@if \'\', \'\' {\n	body {\n		width: auto;\n	}\n}', 'body {\n	width: auto;\n}');
});

test('false condition', function() {
  return assert.compileTo('@if false {\n	body {\n		width: auto;\n	}\n}', '');
});

test('0 as false condition', function() {
  return assert.compileTo('@if 0 {\n	body {\n		width: auto;\n	}\n}', '');
});

test('0% as false condition', function() {
  return assert.compileTo('@if 0% {\n	body {\n		width: auto;\n	}\n}', '');
});

test('0px as false condition', function() {
  return assert.compileTo('@if 0px {\n	body {\n		width: auto;\n	}\n}', '');
});

test('empty string as false condition', function() {
  return assert.compileTo('@if \'\' {\n	body {\n		width: auto;\n	}\n}', '');
});

test('@else if', function() {
  return assert.compileTo('body {\n	@if false {\n		width: auto;\n	} @else if true {\n		height: auto;\n	}\n}', 'body {\n	height: auto;\n}');
});

test('short-ciruit @else if', function() {
  return assert.compileTo('body {\n	@if false {\n		width: auto;\n	} @else if false {\n		height: auto;\n	} @else if true {\n		margin: auto;\n	} @else if true {\n		padding: auto;\n	}\n}', 'body {\n	margin: auto;\n}');
});

test('@else', function() {
  return assert.compileTo('body {\n	@if false {\n		width: auto;\n	} @else {\n		height: auto;\n	}\n}', 'body {\n	height: auto;\n}');
});

test('@else with @else if', function() {
  return assert.compileTo('body {\n	@if false {\n		width: auto;\n	} @else if false {\n		height: auto;\n	} @else {\n		margin: auto;\n	}\n}', 'body {\n	margin: auto;\n}');
});

suite('@for');

test('loop natural range', function() {
  return assert.compileTo('@for $i in 1..3 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}\n\n.span-2 {\n	width: 120px;\n}\n\n.span-3 {\n	width: 180px;\n}');
});

test('loop natural exclusive range', function() {
  return assert.compileTo('@for $i in 1...3 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}\n\n.span-2 {\n	width: 120px;\n}');
});

test('loop one number range', function() {
  return assert.compileTo('@for $i in 1..1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}');
});

test('loop empty range', function() {
  return assert.compileTo('@for $i in 1...1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '');
});

test('loop reversed range', function() {
  return assert.compileTo('@for $i in 3..1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-3 {\n	width: 180px;\n}\n\n.span-2 {\n	width: 120px;\n}\n\n.span-1 {\n	width: 60px;\n}');
});

test('loop reversed exclusive range', function() {
  return assert.compileTo('@for $i in 3...1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-3 {\n	width: 180px;\n}\n\n.span-2 {\n	width: 120px;\n}');
});

test('loop with positive step', function() {
  return assert.compileTo('@for $i by 2 in 1..4 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}\n\n.span-3 {\n	width: 180px;\n}');
});

test('loop with positive step for reversed range', function() {
  return assert.compileTo('@for $i by 2 in 3..1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-3 {\n	width: 180px;\n}\n\n.span-1 {\n	width: 60px;\n}');
});

test('loop with negative step', function() {
  return assert.compileTo('@for $i by -1 in 1...3 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-2 {\n	width: 120px;\n}\n\n.span-1 {\n	width: 60px;\n}');
});

test('loop with negative step for reversed range', function() {
  return assert.compileTo('@for $i by -2 in 3..1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}\n\n.span-3 {\n	width: 180px;\n}');
});

test('not allow step number to be zero', function() {
  return assert.failAt('@for $i by 0 in 1..3 {\n	body {\n		width: auto;\n	}\n}', 1, 12);
});

test('only allow step number to be numberic', function() {
  return assert.failAt('@for $i by a in 1..3 {\n	body {\n		width: auto;\n	}\n}', 1, 12);
});

test('loop list', function() {
  return assert.compileTo('$icons = foo bar, qux;\n@for $icon in $icons {\n	.icon-$icon {\n		content: "$icon";\n	}\n}', '.icon-foo {\n	content: "foo";\n}\n\n.icon-bar {\n	content: "bar";\n}\n\n.icon-qux {\n	content: "qux";\n}');
});

test('loop list with index', function() {
  return assert.compileTo('@for $icon, $i in foo bar, qux {\n	.icon-$icon {\n		content: "$i $icon";\n	}\n}', '.icon-foo {\n	content: "0 foo";\n}\n\n.icon-bar {\n	content: "1 bar";\n}\n\n.icon-qux {\n	content: "2 qux";\n}');
});

test('loop list with index with negative step', function() {
  return assert.compileTo('@for $icon, $i by -1 in foo bar, qux {\n	.icon-$icon {\n		content: "$i $icon";\n	}\n}', '.icon-qux {\n	content: "2 qux";\n}\n\n.icon-bar {\n	content: "1 bar";\n}\n\n.icon-foo {\n	content: "0 foo";\n}');
});

test('loop number', function() {
  return assert.compileTo('@for $i in 1 {\n	.span-$i {\n		width: $i * 60px;\n	}\n}', '.span-1 {\n	width: 60px;\n}');
});

test('loop null', function() {
  return assert.compileTo('@for $i in null {\n	body {\n		margin: 0;\n	}\n}\n\nbody {\n	-foo: $i;\n}', 'body {\n	-foo: null;\n}');
});

suite('mixin');

test('no params', function() {
  return assert.compileTo('$mixin = @mixin {\n	width: auto;\n};\n\nbody {\n	$mixin();\n}', 'body {\n	width: auto;\n}');
});

test('not allow undefined mixin', function() {
  return assert.failAt('body {\n	$mixin();\n}', 2, 2);
});

test('not allow non-mixin to be called', function() {
  return assert.failAt('$mixin = 0;\n\nbody {\n	$mixin();\n}', 4, 2);
});

test('call mixin multiple times', function() {
  return assert.compileTo('$mixin = @mixin {\n	body {\n		width: $width;\n	}\n};\n\n$width = 980px;\n$mixin();\n\n$width = 500px;\n$mixin();', 'body {\n	width: 980px;\n}\n\nbody {\n	width: 500px;\n}');
});

test('specify parameter', function() {
  return assert.compileTo('$mixin = @mixin $width {\n	body {\n		width: $width;\n	}\n};\n\n$mixin(980px);', 'body {\n	width: 980px;\n}');
});

test('specify default parameter', function() {
  return assert.compileTo('$mixin = @mixin $width, $height = 100px {\n	body {\n		width: $width;\n		height: $height;\n	}\n};\n\n$mixin(980px);', 'body {\n	width: 980px;\n	height: 100px;\n}');
});

test('under-specify arguments', function() {
  return assert.compileTo('$mixin = @mixin $width, $height {\n	body {\n		width: $width;\n		height: $height;\n	}\n};\n\n$mixin(980px);', 'body {\n	width: 980px;\n	height: null;\n}');
});

test('under-specify arguments for default parameter', function() {
  return assert.compileTo('$mixin = @mixin $width, $height = 300px {\n	body {\n		width: $width;\n		height: $height;\n	}\n};\n\n$mixin();', 'body {\n	width: null;\n	height: 300px;\n}');
});

suite('scope');

test('ruleset creates new scope', function() {
  return assert.compileTo('$width = 980px;\nbody {\n	$width = 500px;\n	width: $width;\n}\nhtml {\n	width: $width;\n}', 'body {\n	width: 500px;\n}\n\nhtml {\n	width: 980px;\n}');
});

test('@media creates new scope', function() {
  return assert.compileTo('$width = 980px;\n\n@media screen {\n	$width = 500px;\n	body {\n		width: $width;\n	}\n}\n\nhtml {\n	width: $width;\n}', '@media screen {\n	body {\n		width: 500px;\n	}\n}\n\nhtml {\n	width: 980px;\n}');
});

test('@import does not create new scope', function() {
  return assert.compileTo({
    'base.roo': '$width = 500px;\nbody {\n	width: $width;\n}'
  }, '$width = 980px;\n\n@import \'base\';\n\nhtml {\n	width: $width;\n}', 'body {\n	width: 500px;\n}\n\nhtml {\n	width: 500px;\n}');
});

test('@void creates new scope', function() {
  return assert.compileTo('$width = 100px;\n@void {\n	$width = 50px;\n	.button {\n		width: $width;\n	}\n}\n\n#submit {\n	@extend .button;\n}\n\n#reset {\n	width: $width;\n}', '#submit {\n	width: 50px;\n}\n\n#reset {\n	width: 100px;\n}');
});

test('@block creates new scope', function() {
  return assert.compileTo('$width = 980px;\n@block {\n	$width = 500px;\n	body {\n		width: $width;\n	}\n}\nhtml {\n	width: $width;\n}', 'body {\n	width: 500px;\n}\n\nhtml {\n	width: 980px;\n}');
});

test('@if does not create new scope', function() {
  return assert.compileTo('$width = 980px;\n\n@if true {\n	$width = 500px;\n}\n\nbody {\n	width: $width;\n}', 'body {\n	width: 500px;\n}');
});

test('@for does not create new scope', function() {
  return assert.compileTo('$width = 980px;\n\n@for $i in 1 {\n	$width = 500px;\n}\n\nbody {\n	width: $width;\n}', 'body {\n	width: 500px;\n}');
});

suite('prefix');

test('box-sizing', function() {
  return assert.compileTo('body {\n	box-sizing: border-box;\n}', 'body {\n	-webkit-box-sizing: border-box;\n	-moz-box-sizing: border-box;\n	box-sizing: border-box;\n}');
});

test('linear-gradient()', function() {
  return assert.compileTo('body {\n	background: linear-gradient(#000, #fff);\n}', 'body {\n	background: -webkit-linear-gradient(#000, #fff);\n	background: -moz-linear-gradient(#000, #fff);\n	background: -o-linear-gradient(#000, #fff);\n	background: linear-gradient(#000, #fff);\n}');
});

test('linear-gradient() with starting position', function() {
  return assert.compileTo('body {\n	background: linear-gradient(to bottom, #000, #fff);\n}', 'body {\n	background: -webkit-linear-gradient(top, #000, #fff);\n	background: -moz-linear-gradient(top, #000, #fff);\n	background: -o-linear-gradient(top, #000, #fff);\n	background: linear-gradient(to bottom, #000, #fff);\n}');
});

test('linear-gradient() with starting position consisting of two identifiers', function() {
  return assert.compileTo('body {\n	background: linear-gradient(to top left, #000, #fff);\n}', 'body {\n	background: -webkit-linear-gradient(bottom right, #000, #fff);\n	background: -moz-linear-gradient(bottom right, #000, #fff);\n	background: -o-linear-gradient(bottom right, #000, #fff);\n	background: linear-gradient(to top left, #000, #fff);\n}');
});

test('multiple linear-gradient()', function() {
  return assert.compileTo('body {\n	background: linear-gradient(#000, #fff), linear-gradient(#111, #eee);\n}', 'body {\n	background: -webkit-linear-gradient(#000, #fff), -webkit-linear-gradient(#111, #eee);\n	background: -moz-linear-gradient(#000, #fff), -moz-linear-gradient(#111, #eee);\n	background: -o-linear-gradient(#000, #fff), -o-linear-gradient(#111, #eee);\n	background: linear-gradient(#000, #fff), linear-gradient(#111, #eee);\n}');
});

test('background with regular value', function() {
  return assert.compileTo('body {\n	background: #fff;\n}', 'body {\n	background: #fff;\n}');
});

test('skip prefixed property', function() {
  return assert.compileTo('body {\n	-moz-box-sizing: padding-box;\n	box-sizing: border-box;\n}', 'body {\n	-moz-box-sizing: padding-box;\n	-webkit-box-sizing: border-box;\n	box-sizing: border-box;\n}', {
    skipPrefixed: true
  });
});

suite('@keyframes');

test('prefixed @keyframes', function() {
  return assert.compileTo('@-webkit-keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}', '@-webkit-keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}');
});

test('from to', function() {
  return assert.compileTo('@-webkit-keyframes name {\n	from {\n		top: 0;\n	}\n	to {\n		top: 100px;\n	}\n}', '@-webkit-keyframes name {\n	from {\n		top: 0;\n	}\n	to {\n		top: 100px;\n	}\n}');
});

test('keyframe selector list', function() {
  return assert.compileTo('@-webkit-keyframes name {\n	0% {\n		top: 0;\n	}\n	50%, 60% {\n		top: 50px;\n	}\n	100% {\n		top: 100px;\n	}\n}', '@-webkit-keyframes name {\n	0% {\n		top: 0;\n	}\n	50%, 60% {\n		top: 50px;\n	}\n	100% {\n		top: 100px;\n	}\n}');
});

test('unprefixed @keyframes', function() {
  return assert.compileTo('@keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}', '@-webkit-keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}\n\n@-moz-keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}\n\n@-o-keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}\n\n@keyframes name {\n	0% {\n		top: 0;\n	}\n	100% {\n		top: 100px;\n	}\n}');
});

test('contain property needs to be prefixed', function() {
  return assert.compileTo('@keyframes name {\n	from {\n		border-radius: 0;\n	}\n	to {\n		border-radius: 10px;\n	}\n}', '@-webkit-keyframes name {\n	from {\n		-webkit-border-radius: 0;\n		border-radius: 0;\n	}\n	to {\n		-webkit-border-radius: 10px;\n		border-radius: 10px;\n	}\n}\n\n@-moz-keyframes name {\n	from {\n		-moz-border-radius: 0;\n		border-radius: 0;\n	}\n	to {\n		-moz-border-radius: 10px;\n		border-radius: 10px;\n	}\n}\n\n@-o-keyframes name {\n	from {\n		border-radius: 0;\n	}\n	to {\n		border-radius: 10px;\n	}\n}\n\n@keyframes name {\n	from {\n		border-radius: 0;\n	}\n	to {\n		border-radius: 10px;\n	}\n}');
});

suite('@font-face');

test('@font-face', function() {
  return assert.compileTo('@font-face {\n	font-family: font;\n}', '@font-face {\n	font-family: font;\n}');
});

suite('@charset');

test('@charset', function() {
  return assert.compileTo('@charset \'UTF-8\';', '@charset \'UTF-8\';');
});
