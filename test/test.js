'use strict';

var existsSync = fs.existsSync || path.existsSync;
var assert = {};

assert.compileTo = function(options, input, css) {
	if (arguments.length < 3) {
		css = input;
		input = options;
		options = {};
	}

	input = input.join('\n');
	css = css.join('\n');

	options.prettyError = true;
	if (options.imports) {
		for (var file in options.imports) {
			options.imports[file] = options.imports[file].join('\n');
		}
	}

	var called = false;
	roole.compile(input, options, function(error, output) {
		called = true;

		if (error) {
			throw error;
		}

		if (output !== css) {
			error = new Error('');
			error.actual = output;
			error.expected = css;

			output = output ? '\n"""\n' + output + '\n"""\n' : ' ' + output + '\n';
			css = css ? '\n"""\n' + css + '\n"""' : ' empty string';
			error.message = 'input compiled to' + output + 'instead of' + css;

			throw error;
		}
	});

	if (!called) {
		throw new Error('input is never compiled');
	}
};

assert.failAt = function(options, input, loc) {
	if (arguments.length < 3) {
		loc = input;
		input = options;
		options = {};
	}

	input = input.join('\n');

	options.prettyError = true;
	if (options.imports) {
		for (var file in options.imports) {
			options.imports[file] = options.imports[file].join('\n');
		}
	}

	if (!loc.fileName) { loc.fileName = ''; }

	var called = false;
	roole.compile(input, options, function(error) {
		if (!error) {
			throw new Error('no error is thrown');
		}

		if (!error.line) {
			throw error;
		}

		called = true;

		if (error.line !== loc.line) {
			var message = 'error has line number ' + error.line + ' instead of ' + loc.line;
			error.message = message + ':\n\n' + error.message;
			throw error;
		}

		if (error.column !== loc.column) {
			var message = 'error has column number ' + error.column + ' instead of ' + loc.column;
			error.message = message + ':\n\n' + error.message;
			throw error;
		}

		if (error.fileName !== loc.fileName) {
			var message = 'error has file path ' + error.fileName + ' instead of ' + loc.fileName;
			error.message = message + ':\n\n' + error.message;
			throw error;
		}
	});

	if (!called) {
		throw new Error('input is never compiled');
	}
};

assert.run = function(cmd, input, output) {
	var dir = 'test-dir';
	if (!existsSync(dir)) {
		mkdirp.sync(dir);
	}

	if (Array.isArray(input.stdin)) {
		input.stdin = input.stdin.join('\n');
	}

	var done = output.done;
	var callback = function(error) {
		exec('rm -rf ' + dir, function() {
			done(error);
		});
	};

	if (input.files) {
		for (var fileName in input.files) {
			var fileContent = input.files[fileName];
			fileName = path.join(dir, fileName);

			if (existsSync(fileName)) {
				return callback(new Error("'" + fileName + "' already exists"));
			}

			var fileDir = path.dirname(fileName);
			if (!existsSync(fileDir)) {
				mkdirp.sync(fileDir);
			}

			if (Array.isArray(fileContent)) {
				fileContent = fileContent.join('\n');
			}

			fs.writeFileSync(fileName, fileContent);
		}
	}

	var child = exec('../bin/' + cmd, {cwd: dir}, function(error, stdout) {
		if (error) {
			return callback(error);
		}

		if (Array.isArray(output.stdout)) {
			output.stdout = output.stdout.join('\n');
		}

		if (output.stdout) {
			output.stdout += '\n';
			stdout = stdout.toString();
			if (stdout !== output.stdout) {
				return callback(new Error('stdout is\n"""\n' + stdout + '\n"""\n\ninstead of\n\n"""\n' + output.stdout + '\n"""'));
			}
		} else if (output.files) {
			for (var fileName in output.files) {
				var fileContent = output.files[fileName];
				fileName = path.join(dir, fileName);

				if (fileContent === null) {
					if (existsSync(fileName)) {
						return callback(new Error('"' + fileName + '" is created, which is not supposed to be'));
					}

					continue;
				}

				var realContent = fs.readFileSync(fileName, 'utf8');

				if (Array.isArray(fileContent)) {
					fileContent = fileContent.join('\n');
				}

				if (realContent !== fileContent) {
					return callback(new Error('"' + fileName + '" is\n"""\n' + realContent + '\n"""\n\ninstead of\n\n"""\n' + fileContent + '\n"""'));
				}
			}
		}

		callback();
	});

	if (input.stdin) {
		child.stdin.end(input.stdin);
	}
};

suite('comment');

test('empty input', function() {
	assert.compileTo([
		'',
	], [
		'',
	]);
});

test('pure spaces input', function() {
	assert.compileTo([
		'  ',
	], [
		'',
	]);
});

test('single-line commnet', function() {
	assert.compileTo([
		'// before selector',
		'body // selctor',
		'{',
		'// after selector',
		'	// before property',
		'	width: auto; // property',
		'	// after property',
		'// outdent',
		'	height: auto; // before eof',
		'}',
	], [
		'body {',
		'	width: auto;',
		'	height: auto;',
		'}',
	]);
});

test('multi-line commnet', function() {
	assert.compileTo([
		'/* license */',
		'',
		'body {',
		'/* after selector */',
		'	margin: 0;',
		'}',
	], [
		'/* license */',
		'',
		'body {',
		'	margin: 0;',
		'}',
	]);
});

suite('selector');

test('simple selector', function() {
	assert.compileTo([
		'div {',
		'	width: auto;',
		'}',
	], [
		'div {',
		'	width: auto;',
		'}',
	]);
});

test('compound selector', function() {
	assert.compileTo([
		'body div {',
		'	width: auto;',
		'}',
	], [
		'body div {',
		'	width: auto;',
		'}',
	]);
});

test('selector list', function() {
	assert.compileTo([
		'div, p {',
		'	width: auto;',
		'}',
	], [
		'div,',
		'p {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector under selector', function() {
	assert.compileTo([
		'body {',
		'	div {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body div {',
		'	width: auto;',
		'}',
	]);
});

test('nest & selector under selector', function() {
	assert.compileTo([
		'body {',
		'	& {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('nest & selector followed by identifier under selector', function() {
	assert.compileTo([
		'.menu {',
		'	&-item {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'.menu-item {',
		'	width: auto;',
		'}',
	]);
});

test('nest & selector followed by identifier prepended with dash under selector', function() {
	assert.compileTo([
		'.menu {',
		'	&--item {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'.menu--item {',
		'	width: auto;',
		'}',
	]);
});

test('not allow nesting & selector followed by identifier to result in invalid selector', function() {
	assert.failAt([
		'[type=button] {',
		'	&-item {',
		'		width: auto;',
		'	}',
		'}',
	], {line: 2, column: 2});
});

test('nest selector containing & selector under selector', function() {
	assert.compileTo([
		'body {',
		'	html & {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html body {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector starting with combinator under selector', function() {
	assert.compileTo([
		'body {',
		'	> div {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body > div {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector list under selector', function() {
	assert.compileTo([
		'body div {',
		'	p, img {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body div p,',
		'body div img {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector list containing & selector under selector', function() {
	assert.compileTo([
		'body div {',
		'	&, img {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body div,',
		'body div img {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector under selector list', function() {
	assert.compileTo([
		'html, body {',
		'	div {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html div,',
		'body div {',
		'	width: auto;',
		'}',
	]);
});

test('nest & selector under selector list', function() {
	assert.compileTo([
		'html, body {',
		'	& {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html,',
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector containing & selector under selector list', function() {
	assert.compileTo([
		'body, div {',
		'	html & {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html body,',
		'html div {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector starting with combinator under selector list', function() {
	assert.compileTo([
		'body, div {',
		'	> p {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body > p,',
		'div > p {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector list under selector list', function() {
	assert.compileTo([
		'html, body {',
		'	p, img {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html p,',
		'html img,',
		'body p,',
		'body img {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector list containing & selector under selector list', function() {
	assert.compileTo([
		'html, body {',
		'	&, img {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html,',
		'html img,',
		'body,',
		'body img {',
		'	width: auto;',
		'}',
	]);
});

test('nest selector list containing selector starting with combinator under selector list', function() {
	assert.compileTo([
		'body, div {',
		'	> p, img {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body > p,',
		'body img,',
		'div > p,',
		'div img {',
		'	width: auto;',
		'}',
	]);
});

test('deeply nested selector', function() {
	assert.compileTo([
		'html {',
		'	body {',
		'		div {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'html body div {',
		'	width: auto;',
		'}',
	]);
});

test('not allow & selector at the top level', function() {
	assert.failAt([
		'& {',
		'	width: auto;',
		'}',
	], {line: 1, column: 1});
});

test('not allow selector starting with a combinator at the top level', function() {
	assert.failAt([
		'> div {',
		'	width: auto;',
		'}',
	], {line: 1, column: 1});
});

test('not allow & selector at the top level', function() {
	assert.failAt([
		'& {',
		'	width: auto;',
		'}',
	], {line: 1, column: 1});
});

test('interpolating selector', function() {
	assert.compileTo([
		'$sel = " body ";',
		'$sel {',
		'	width: auto;',
		'}',
	], [
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('not allow interpolating invalid selector', function() {
	assert.failAt([
		'$sel = "body #";',
		'$sel {',
		'	width: auto;',
		'}',
	], {line: 2, column: 1});
});

test('not allow interpolating & selector at the top level', function() {
	assert.failAt([
		'$sel = "&";',
		'$sel {',
		'	width: auto;',
		'}',
	], {line: 2, column: 1});
});

test('interpolating selector inside selector', function() {
	assert.compileTo([
		'$sel = "div ";',
		'body $sel {',
		'	width: auto;',
		'}',
	], [
		'body div {',
		'	width: auto;',
		'}',
	]);
});

test('interpolating selector staring with combinator inside selector', function() {
	assert.compileTo([
		'$sel = " >  div";',
		'body $sel {',
		'	width: auto;',
		'}',
	], [
		'body > div {',
		'	width: auto;',
		'}',
	]);
});

test('not allow interpolating & selector inside selector at the top level', function() {
	assert.failAt([
		'$sel = "& div";',
		'body $sel {',
		'	width: auto;',
		'}',
	], {line: 2, column: 6});
});

test('interpolating selector containing & selector and nested under selector', function() {
	assert.compileTo([
		'$sel = "& div";',
		'body {',
		'	html $sel {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'html body div {',
		'	width: auto;',
		'}',
	]);
});

test('not allow interpolating selector list inside selector', function() {
	assert.failAt([
		'$sel = "div, p";',
		'body $sel {',
		'	width: auto;',
		'}',
	], {line: 2, column: 6});
});

test('interpolate identifier', function() {
	assert.compileTo([
		'$sel = div;',
		'$sel {',
		'	width: auto;',
		'}',
	], [
		'div {',
		'	width: auto;',
		'}',
	]);
});

test('universal selector', function() {
	assert.compileTo([
		'* {',
		'	margin: 0;',
		'}',
	], [
		'* {',
		'	margin: 0;',
		'}',
	]);
});

test('attribute selector', function() {
	assert.compileTo([
		'input[type=button] {',
		'	margin: 0;',
		'}',
	], [
		'input[type=button] {',
		'	margin: 0;',
		'}',
	]);
});

test('attribute selector without value', function() {
	assert.compileTo([
		'input[hidden] {',
		'	margin: 0;',
		'}',
	], [
		'input[hidden] {',
		'	margin: 0;',
		'}',
	]);
});

test('pseudo selector', function() {
	assert.compileTo([
		':hover {',
		'	text-decoration: underline;',
		'}',
	], [
		':hover {',
		'	text-decoration: underline;',
		'}',
	]);
});

test('double-colon pseudo selector', function() {
	assert.compileTo([
		'a::before {',
		'	content: " ";',
		'}',
	], [
		'a::before {',
		'	content: " ";',
		'}',
	]);
});

test('multi-line pseudo selector', function() {
	assert.compileTo([
		'body {',
		'	a:hover,',
		'	span:hover {',
		'		text-decoration: underline;',
		'	}',
		'}',
	], [
		'body a:hover,',
		'body span:hover {',
		'	text-decoration: underline;',
		'}',
	]);
});

test('functional pseudo selector', function() {
	assert.compileTo([
		'a:nth-child(2n+1) {',
		'	text-decoration: underline;',
		'}',
	], [
		'a:nth-child(2n+1) {',
		'	text-decoration: underline;',
		'}',
	]);
});

test('functional pseudo selector with identifier', function() {
	assert.compileTo([
		'a:nth-child(odd) {',
		'	text-decoration: underline;',
		'}',
	], [
		'a:nth-child(odd) {',
		'	text-decoration: underline;',
		'}',
	]);
});

test('negation selector', function() {
	assert.compileTo([
		'a:not(.link) {',
		'	text-decoration: none;',
		'}',
	], [
		'a:not(.link) {',
		'	text-decoration: none;',
		'}',
	]);
});

suite('property');

test('starred property', function() {
	assert.compileTo([
		'body {',
		'	*zoom: 1;',
		'}',
	], [
		'body {',
		'	*zoom: 1;',
		'}',
	]);
});

test('!important', function() {
	assert.compileTo([
		'body {',
		'	width: auto !important;',
		'}',
	], [
		'body {',
		'	width: auto !important;',
		'}',
	]);
});

test('without trailing semicolon', function() {
	assert.compileTo([
		'body {',
		'	margin: 0',
		'}',
	], [
		'body {',
		'	margin: 0;',
		'}',
	]);
});

test('with multiple trailing semicolons', function() {
	assert.compileTo([
		'body {',
		'	margin: 0;;',
		'}',
	], [
		'body {',
		'	margin: 0;',
		'}',
	]);
});

test('with multiple trailing ; interspersed with spaces', function() {
	assert.compileTo([
		'body {',
		'	margin: 0; ;',
		'}',
	], [
		'body {',
		'	margin: 0;',
		'}',
	]);
});

test('with trailing ; and !important', function() {
	assert.compileTo([
		'body {',
		'	margin: 0 !important;',
		'}',
	], [
		'body {',
		'	margin: 0 !important;',
		'}',
	]);
});

suite('ruleset');

test('remove empty ruleset', function() {
	assert.compileTo([
		'body {}',
	], [
		'',
	]);
});

suite('assignment');

test('variables are case-sensitive', function() {
	assert.compileTo([
		'$width = 960px;',
		'$Width = 480px;',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('?= after =', function() {
	assert.compileTo([
		'$width = 960px;',
		'$width ?= 480px;',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('lone ?= ', function() {
	assert.compileTo([
		'$width ?= 480px;',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 480px;',
		'}',
	]);
});

test('+=', function() {
	assert.compileTo([
		'$width = 480px;',
		'$width += 100px;',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 580px;',
		'}',
	]);
});

suite('identifier');

test('starting with a dash', function() {
	assert.compileTo([
		'body {',
		'	-webkit-box-sizing: border-box;',
		'}',
	], [
		'body {',
		'	-webkit-box-sizing: border-box;',
		'}',
	]);
});

test('not allow starting with double-dash', function() {
	assert.failAt([
		'body {',
		'	--webkit-box-sizing: border-box;',
		'}',
	], {line: 2, column: 3});
});

test('interpolate identifier', function() {
	assert.compileTo([
		'$name = star;',
		'.icon-$name {',
		'	float: left;',
		'}',
	], [
		'.icon-star {',
		'	float: left;',
		'}',
	]);
});

test('interpolate number', function() {
	assert.compileTo([
		'$num = 12;',
		'.icon-$num {',
		'	float: left;',
		'}',
	], [
		'.icon-12 {',
		'	float: left;',
		'}',
	]);
});

test('interpolate string', function() {
	assert.compileTo([
		'$name = "star";',
		'.icon-$name {',
		'	float: left;',
		'}',
	], [
		'.icon-star {',
		'	float: left;',
		'}',
	]);
});

test('not allow interpolating function', function() {
	assert.failAt([
		'$name = @function {',
		'	body {',
		'		margin: auto;',
		'	}',
		'};',
		'.icon-$name {',
		'	float: left;',
		'}',
	], {line: 6, column: 7});
});

test('interpolate multiple variables', function() {
	assert.compileTo([
		'$size = big;',
		'$name = star;',
		'.icon-$size$name {',
		'	float: left;',
		'}',
	], [
		'.icon-bigstar {',
		'	float: left;',
		'}',
	]);
});

test('interpolation consists only two variables', function() {
	assert.compileTo([
		'$prop = border;',
		'$pos = -left;',
		'body {',
		'	$prop$pos: solid;',
		'}',
	], [
		'body {',
		'	border-left: solid;',
		'}',
	]);
});

test('braced interpolation', function() {
	assert.compileTo([
		'$prop = border;',
		'body {',
		'	{$prop}: solid;',
		'}',
	], [
		'body {',
		'	border: solid;',
		'}',
	]);
});

test('contain dangling dash', function() {
	assert.compileTo([
		'$prop = border;',
		'$pos = left;',
		'body {',
		'	{$prop}-$pos: solid;',
		'}',
	], [
		'body {',
		'	border-left: solid;',
		'}',
	]);
});

test('contain double dangling dashes', function() {
	assert.compileTo([
		'$module = icon;',
		'$name = star;',
		'.{$module}--{$name} {',
		'	display: inline-block;',
		'}',
	], [
		'.icon--star {',
		'	display: inline-block;',
		'}',
	]);
});

test('start with dangling dash', function() {
	assert.compileTo([
		'$prefix = moz;',
		'$prop = box-sizing;',
		'body {',
		'	-{$prefix}-$prop: border-box;',
		'}',
	], [
		'body {',
		'	-moz-box-sizing: border-box;',
		'}',
	]);
});

suite('string');

test('single-quoted string with escaped quote', function() {
	assert.compileTo([
		'a {',
		'	content: \'"a\\\'\';',
		'}',
	], [
		'a {',
		'	content: \'"a\\\'\';',
		'}',
	]);
});

test('empty single-quoted string', function() {
	assert.compileTo([
		'a {',
		'	content: \'\';',
		'}',
	], [
		'a {',
		'	content: \'\';',
		'}',
	]);
});

test('not interpolating single-quoted string', function() {
	assert.compileTo([
		'a {',
		'	content: \'a $var\';',
		'}',
	], [
		'a {',
		'	content: \'a $var\';',
		'}',
	]);
});

test('double-quoted string with escaped quote', function() {
	assert.compileTo([
		'a {',
		'	content: "\'a0\\"";',
		'}',
	], [
		'a {',
		'	content: "\'a0\\"";',
		'}',
	]);
});

test('empty double-quoted string', function() {
	assert.compileTo([
		'a {',
		'	content: "";',
		'}',
	], [
		'a {',
		'	content: "";',
		'}',
	]);
});

test('interpolate identifier', function() {
	assert.compileTo([
		'$name = guest;',
		'a {',
		'	content: "hello $name";',
		'}',
	], [
		'a {',
		'	content: "hello guest";',
		'}',
	]);
});

test('interpolate single-quoted string', function() {
	assert.compileTo([
		'$name = \'guest\';',
		'a {',
		'	content: "hello $name";',
		'}',
	], [
		'a {',
		'	content: "hello guest";',
		'}',
	]);
});

test('interpolate double-quoted string', function() {
	assert.compileTo([
		'$name = "guest";',
		'a {',
		'	content: "hello $name";',
		'}',
	], [
		'a {',
		'	content: "hello guest";',
		'}',
	]);
});

test('not allow interpolating function', function() {
	assert.failAt([
		'$name = @function {',
		'	body {',
		'		margin: auto;',
		'	}',
		'};',
		'a {',
		'	content: "hello $name";',
		'}',
	], {line: 7, column: 18});
});

test('contain braced variable', function() {
	assert.compileTo([
		'$chapter = 4;',
		'figcaption {',
		'	content: "Figure {$chapter}-12";',
		'}',
	], [
		'figcaption {',
		'	content: "Figure 4-12";',
		'}',
	]);
});

test('escape braced variable', function() {
	assert.compileTo([
		'figcaption {',
		'	content: "Figure \\{\\$chapter}-12";',
		'}',
	], [
		'figcaption {',
		'	content: "Figure \\{\\$chapter}-12";',
		'}',
	]);
});

test('contain braces but not variable', function() {
	assert.compileTo([
		'$chapter = 4;',
		'figcaption {',
		'	content: "Figure {chapter}-12";',
		'}',
	], [
		'figcaption {',
		'	content: "Figure {chapter}-12";',
		'}',
	]);
});

test('escape double quotes', function() {
	assert.compileTo([
		'$str = \'"\\""\';',
		'a {',
		'	content: "$str";',
		'}',
	], [
		'a {',
		'	content: "\\"\\"\\"";',
		'}',
	]);
});

suite('number');

test('fraction', function() {
	assert.compileTo([
		'body {',
		'	line-height: 1.24;',
		'}',
	], [
		'body {',
		'	line-height: 1.24;',
		'}',
	]);
});

test('fraction without whole number part', function() {
	assert.compileTo([
		'body {',
		'	line-height: .24;',
		'}',
	], [
		'body {',
		'	line-height: 0.24;',
		'}',
	]);
});

suite('percentage');

test('percentage', function() {
	assert.compileTo([
		'body {',
		'	width: 33.33%;',
		'}',
	], [
		'body {',
		'	width: 33.33%;',
		'}',
	]);
});

suite('dimension');

test('time', function() {
	assert.compileTo([
		'body {',
		'	-webkit-transition-duration: .24s;',
		'}',
	], [
		'body {',
		'	-webkit-transition-duration: 0.24s;',
		'}',
	]);
});

suite('url()');

test('url contains protocol', function() {
	assert.compileTo([
		'a {',
		'	content: url(http://example.com/icon.png?size=small+big);',
		'}',
	], [
		'a {',
		'	content: url(http://example.com/icon.png?size=small+big);',
		'}',
	]);
});

test('url is string', function() {
	assert.compileTo([
		'a {',
		'	content: url("icon.png");',
		'}',
	], [
		'a {',
		'	content: url("icon.png");',
		'}',
	]);
});

suite('color');

test('3-digit #rgb', function() {
	assert.compileTo([
		'body {',
		'	color: #000;',
		'}',
	], [
		'body {',
		'	color: #000;',
		'}',
	]);
});

test('6-digit #rgb', function() {
	assert.compileTo([
		'body {',
		'	color: #ff1234;',
		'}',
	], [
		'body {',
		'	color: #ff1234;',
		'}',
	]);
});

suite('call');

test('single argument', function() {
	assert.compileTo([
		'a {',
		'	content: attr(href);',
		'}',
	], [
		'a {',
		'	content: attr(href);',
		'}',
	]);
});

test('multiple arguments', function() {
	assert.compileTo([
		'a {',
		'	content: counters(item, ".");',
		'}',
	], [
		'a {',
		'	content: counters(item, ".");',
		'}',
	]);
});

suite('function');

test('no params', function() {
	assert.compileTo([
		'$width = @function {',
		'	@return 960px;',
		'};',
		'',
		'body {',
		'	width: $width();',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('not allow undefined function', function() {
	assert.failAt([
		'body {',
		'	width: $width();',
		'}',
	], {line: 2, column: 9});
});

test('not allow non-function to be called', function() {
	assert.failAt([
		'$width = 960px;',
		'',
		'body {',
		'	width: $width();',
		'}',
	], {line: 4, column: 9});
});

test('not allow using @return outside @function', function() {
	assert.failAt([
		'body {',
		'	@return 1;',
		'}',
	], {line: 2, column: 2});
});

test('call function multiple times', function() {
	assert.compileTo([
		'$get-value = @function {',
		'	@return $value;',
		'};',
		'',
		'body {',
		'	$value = 960px;',
		'	width: $get-value();',
		'',
		'	$value = 400px;',
		'	height: $get-value();',
		'}',
		'',
	], [
		'body {',
		'	width: 960px;',
		'	height: 400px;',
		'}',
	]);
});

test('specify parameter', function() {
	assert.compileTo([
		'$width = @function $width {',
		'	@return $width;',
		'};',
		'',
		'body {',
		'	width: $width(960px);',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('specify default parameter', function() {
	assert.compileTo([
		'$width = @function $width = 960px {',
		'	@return $width;',
		'};',
		'',
		'body {',
		'	width: $width();',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('specify default parameter, overriden', function() {
	assert.compileTo([
		'$width = @function $width = 960px {',
		'	@return $width;',
		'};',
		'',
		'body {',
		'	width: $width(400px);',
		'}',
	], [
		'body {',
		'	width: 400px;',
		'}',
	]);
});

test('under-specify arguments', function() {
	assert.compileTo([
		'$margin = @function $h, $v {',
		'	@return $h $v;',
		'};',
		'',
		'body {',
		'	margin: $margin(20px);',
		'}',
	], [
		'body {',
		'	margin: 20px null;',
		'}',
	]);
});

test('rest argument', function() {
	assert.compileTo([
		'$add = @function ...$numbers {',
		'	$sum = 0;',
		'	@for $number in $numbers {',
		'		$sum = $sum + $number;',
		'	}',
		'	@return $sum;',
		'};',
		'',
		'body {',
		'	width: $add(1, 2, 3, 4);',
		'}',
	], [
		'body {',
		'	width: 10;',
		'}',
	]);
});

test('ignore rules under @return', function() {
	assert.compileTo([
		'$width = @function {',
		'	$width = 960px;',
		'	@return $width;',
		'',
		'	$width = 400px;',
		'	@return $width;',
		'};',
		'',
		'body {',
		'	width: $width();',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('ignore block rules', function() {
	assert.compileTo([
		'$width = @function {',
		'	div {',
		'		margin: 0;',
		'	}',
		'',
		'	$width = 960px;',
		'	@return $width;',
		'};',
		'',
		'body {',
		'	width: $width();',
		'}',
	], [
		'body {',
		'	width: 960px;',
		'}',
	]);
});

test('implicit @return', function() {
	assert.compileTo([
		'$width = @function {',
		'	div {',
		'		margin: 0;',
		'	}',
		'};',
		'',
		'body {',
		'	width: $width();',
		'}',
	], [
		'body {',
		'	width: null;',
		'}',
	]);
});

test('$arguments', function() {
	assert.compileTo([
		'$arguments = @function {',
		'	@return $arguments;',
		'};',
		'',
		'body {',
		'	-foo: $arguments(foo, bar)',
		'}',
	], [
		'body {',
		'	-foo: foo, bar;',
		'}',
	]);
});

test('not modify arguments by direct assignment', function() {
	assert.compileTo([
		'$modify = @function $param {',
		'	$param = 1;',
		'	@return $param;',
		'};',
		'',
		'body {',
		'	$arg = 0;',
		'	-foo: $modify($arg) $arg;',
		'}',
	], [
		'body {',
		'	-foo: 1 0;',
		'}',
	]);
});

suite('list');

test('space-separated list', function() {
	assert.compileTo([
		'body {',
		'	margin: 10px 0 30px;',
		'}',
	], [
		'body {',
		'	margin: 10px 0 30px;',
		'}',
	]);
});

test('comma-separated list', function() {
	assert.compileTo([
		'body {',
		'	font-family: font1, font2, font3;',
		'}',
	], [
		'body {',
		'	font-family: font1, font2, font3;',
		'}',
	]);
});

test('slash-separated list', function() {
	assert.compileTo([
		'body {',
		'	font: 14px/1.2;',
		'}',
	], [
		'body {',
		'	font: 14px/1.2;',
		'}',
	]);
});

test('mix-separated list', function() {
	assert.compileTo([
		'body {',
		'	font: normal 12px/1.25 font1, font2;',
		'}',
	], [
		'body {',
		'	font: normal 12px/1.25 font1, font2;',
		'}',
	]);
});

suite('addition');

test('number + number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 1;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number + percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 1%;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('number + dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 1px;',
		'}',
	], [
		'body {',
		'	-foo: 2px;',
		'}',
	]);
});

test('number + function, not allowed', function() {
	assert.failAt([
		'$function = @function {',
		'	body {',
		'		margin: 0;',
		'	}',
		'};',
		'body {',
		'	-foo: 1 + $function;',
		'}',
	], {line: 7, column: 8});
});

test('number + string', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + "str";',
		'}',
	], [
		'body {',
		'	-foo: "1str";',
		'}',
	]);
});

test('percentage + number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% + 1;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('percentage + percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% + 1%;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('percentage + dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2% + 1px;',
		'}',
	], [
		'body {',
		'	-foo: 3%;',
		'}',
	]);
});

test('percentage + string', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2% + "str";',
		'}',
	], [
		'body {',
		'	-foo: "2%str";',
		'}',
	]);
});

test('dimension + number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px + 1;',
		'}',
	], [
		'body {',
		'	-foo: 2px;',
		'}',
	]);
});

test('dimension + dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px + 1px;',
		'}',
	], [
		'body {',
		'	-foo: 2px;',
		'}',
	]);
});

test('dimension + dimension, different units', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1em + 1px;',
		'}',
	], [
		'body {',
		'	-foo: 2em;',
		'}',
	]);
});

test('dimension + identifier', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px + id;',
		'}',
	], [
		'body {',
		'	-foo: 1pxid;',
		'}',
	]);
});

test('dimension + string', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px + "str";',
		'}',
	], [
		'body {',
		'	-foo: "1pxstr";',
		'}',
	]);
});

test('boolean + identifier', function() {
	assert.compileTo([
		'body {',
		'	-foo: true + id;',
		'}',
	], [
		'body {',
		'	-foo: trueid;',
		'}',
	]);
});

test('boolean + string', function() {
	assert.compileTo([
		'body {',
		'	-foo: true + "str";',
		'}',
	], [
		'body {',
		'	-foo: "truestr";',
		'}',
	]);
});

test('identifier + number', function() {
	assert.compileTo([
		'body {',
		'	-foo: id + 1;',
		'}',
	], [
		'body {',
		'	-foo: id1;',
		'}',
	]);
});

test('identifier + identifier', function() {
	assert.compileTo([
		'body {',
		'	-foo: -webkit + -moz;',
		'}',
	], [
		'body {',
		'	-foo: -webkit-moz;',
		'}',
	]);
});

test('identifier + dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: id + 1px;',
		'}',
	], [
		'body {',
		'	-foo: id1px;',
		'}',
	]);
});

test('identifier + boolean', function() {
	assert.compileTo([
		'body {',
		'	-foo: id + true;',
		'}',
	], [
		'body {',
		'	-foo: idtrue;',
		'}',
	]);
});

test('identifier + str', function() {
	assert.compileTo([
		'body {',
		'	-foo: id + "str";',
		'}',
	], [
		'body {',
		'	-foo: "idstr";',
		'}',
	]);
});

test('string + number', function() {
	assert.compileTo([
		'body {',
		'	-foo: "str" + 1;',
		'}',
	], [
		'body {',
		'	-foo: "str1";',
		'}',
	]);
});

test('string + percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: "str" + 1%;',
		'}',
	], [
		'body {',
		'	-foo: "str1%";',
		'}',
	]);
});

test('string + dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: "str" + 1px;',
		'}',
	], [
		'body {',
		'	-foo: "str1px";',
		'}',
	]);
});

test('string + boolean', function() {
	assert.compileTo([
		'body {',
		'	-foo: "str" + false;',
		'}',
	], [
		'body {',
		'	-foo: "strfalse";',
		'}',
	]);
});

test('string + identifier', function() {
	assert.compileTo([
		'body {',
		'	-foo: "str" + id;',
		'}',
	], [
		'body {',
		'	-foo: "strid";',
		'}',
	]);
});

test('string + string', function() {
	assert.compileTo([
		'body {',
		'	-foo: "foo" + "bar";',
		'}',
	], [
		'body {',
		'	-foo: "foobar";',
		'}',
	]);
});

test('string + string, different quotes', function() {
	assert.compileTo([
		'body {',
		'	-foo: "foo" + \'bar\';',
		'}',
	], [
		'body {',
		'	-foo: "foobar";',
		'}',
	]);
});

test('number+number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1+1;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number+ number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1+ 1;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

suite('subtraction');

test('number - number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 - 1;',
		'}',
	], [
		'body {',
		'	-foo: 0;',
		'}',
	]);
});

test('number - percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 - 1%;',
		'}',
	], [
		'body {',
		'	-foo: 0%;',
		'}',
	]);
});

test('number - dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 - 2px;',
		'}',
	], [
		'body {',
		'	-foo: -1px;',
		'}',
	]);
});

test('percentage - number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% - 2;',
		'}',
	], [
		'body {',
		'	-foo: -1%;',
		'}',
	]);
});

test('percentage - percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% - 1%;',
		'}',
	], [
		'body {',
		'	-foo: 0%;',
		'}',
	]);
});

test('percentage - dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% - 2px;',
		'}',
	], [
		'body {',
		'	-foo: -1%;',
		'}',
	]);
});

test('dimension - number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px - 1;',
		'}',
	], [
		'body {',
		'	-foo: 0px;',
		'}',
	]);
});

test('dimension - dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px - 1px;',
		'}',
	], [
		'body {',
		'	-foo: 0px;',
		'}',
	]);
});

test('dimension - dimension, different units', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1em - 2px;',
		'}',
	], [
		'body {',
		'	-foo: -1em;',
		'}',
	]);
});

test('number-number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1-1;',
		'}',
	], [
		'body {',
		'	-foo: 0;',
		'}',
	]);
});

test('number- number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1- 1;',
		'}',
	], [
		'body {',
		'	-foo: 0;',
		'}',
	]);
});

suite('multiplication');

test('number * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 * 2;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number * percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 * 1%;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('number * dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 * 2px;',
		'}',
	], [
		'body {',
		'	-foo: 2px;',
		'}',
	]);
});

test('percentage * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% * 2;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('percentage * percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% * 1%;',
		'}',
	], [
		'body {',
		'	-foo: 1%;',
		'}',
	]);
});

test('percentage * dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% * 2px;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('dimension * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px * 1;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

test('dimension * dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px * 1px;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

test('dimension * dimension, different units', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1em * 2px;',
		'}',
	], [
		'body {',
		'	-foo: 2em;',
		'}',
	]);
});

test('number*number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1*2;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number* number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1* 2;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number *number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 *2;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

suite('division');

test('number / number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 / 2;',
		'}',
	], [
		'body {',
		'	-foo: 0.5;',
		'}',
	]);
});

test('number / 0, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1 / 0;',
		'}',
	], {line: 2, column: 12});
});

test('number / number, result in fraction', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 / 3;',
		'}',
	], [
		'body {',
		'	-foo: 0.333;',
		'}',
	]);
});

test('number / percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 / 1%;',
		'}',
	], [
		'body {',
		'	-foo: 2%;',
		'}',
	]);
});

test('number / 0%, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1 / 0%;',
		'}',
	], {line: 2, column: 12});
});

test('number / dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 / 2px;',
		'}',
	], [
		'body {',
		'	-foo: 0.5px;',
		'}',
	]);
});

test('number / 0px, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1 / 0px;',
		'}',
	], {line: 2, column: 12});
});

test('percentage / number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% / 2;',
		'}',
	], [
		'body {',
		'	-foo: 0.5%;',
		'}',
	]);
});

test('percentage / 0, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1% / 0;',
		'}',
	], {line: 2, column: 13});
});

test('percentage / percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% / 1%;',
		'}',
	], [
		'body {',
		'	-foo: 1%;',
		'}',
	]);
});

test('percentage / 0%, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1% / 0%;',
		'}',
	], {line: 2, column: 13});
});

test('percentage / dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1% / 2px;',
		'}',
	], [
		'body {',
		'	-foo: 0.5%;',
		'}',
	]);
});

test('percentage / 0px, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1% / 0px;',
		'}',
	], {line: 2, column: 13});
});

test('dimension / number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px / 1;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

test('dimension / 0, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1px / 0;',
		'}',
	], {line: 2, column: 14});
});

test('dimension / percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px / 2%;',
		'}',
	], [
		'body {',
		'	-foo: 0.5px;',
		'}',
	]);
});

test('dimension / 0%, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1px / 0%;',
		'}',
	], {line: 2, column: 14});
});

test('dimension / dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px / 1px;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

test('dimension / dimension, different units', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1em / 2px;',
		'}',
	], [
		'body {',
		'	-foo: 0.5em;',
		'}',
	]);
});

test('dimension / 0px, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: 1px / 0px;',
		'}',
	], {line: 2, column: 14});
});

test('number/ number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1/ 2;',
		'}',
	], [
		'body {',
		'	-foo: 0.5;',
		'}',
	]);
});

test('number /number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 /2;',
		'}',
	], [
		'body {',
		'	-foo: 0.5;',
		'}',
	]);
});

suite('modulus');

test('number % number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 3 % 2;',
		'}',
	], [
		'body {',
		'	-foo: 1;',
		'}',
	]);
});

test('percentage % number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 4% % 2;',
		'}',
	], [
		'body {',
		'	-foo: 0%;',
		'}',
	]);
});

test('dimension % number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 3px % 2;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

suite('relational');

test('number < number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 < 2;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('number <= number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 <= 2;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('number > number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 > 2;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('number >= number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 >= 3;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('number >= identifer', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2 >= abc;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('identifer < number', function() {
	assert.compileTo([
		'body {',
		'	-foo: abc < 2;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('identifier < identifier', function() {
	assert.compileTo([
		'body {',
		'	-foo: a < b;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('string > string', function() {
	assert.compileTo([
		'body {',
		'	-foo: "b" > "a";',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

suite('equality');

test('is, true', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 is 1;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('is, false', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 is 2;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('isnt, true', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 isnt 2;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('isnt, false', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 isnt 1;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('inclusive range isnt exclusive range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1..2 isnt 1...2;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

suite('logical');

test('true and false', function() {
	assert.compileTo([
		'body {',
		'	-foo: true and false;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('true and true', function() {
	assert.compileTo([
		'body {',
		'	-foo: true and true;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('false and true', function() {
	assert.compileTo([
		'body {',
		'	-foo: false and true;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('false and false', function() {
	assert.compileTo([
		'body {',
		'	-foo: false and false;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('true or false', function() {
	assert.compileTo([
		'body {',
		'	-foo: true or false;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('true or true', function() {
	assert.compileTo([
		'body {',
		'	-foo: true or true;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('false or true', function() {
	assert.compileTo([
		'body {',
		'	-foo: false or true;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('false or false', function() {
	assert.compileTo([
		'body {',
		'	-foo: false or false;',
		'}',
	], [
		'body {',
		'	-foo: false;',
		'}',
	]);
});

test('true and false or true', function() {
	assert.compileTo([
		'body {',
		'	-foo: true and false or true;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

suite('range');

test('natural range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1..3;',
		'}',
	], [
		'body {',
		'	-foo: 1 2 3;',
		'}',
	]);
});

test('natural exclusive range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1...3;',
		'}',
	], [
		'body {',
		'	-foo: 1 2;',
		'}',
	]);
});

test('reversed range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 3..1;',
		'}',
	], [
		'body {',
		'	-foo: 3 2 1;',
		'}',
	]);
});

test('reversed exclusive range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 3...1;',
		'}',
	], [
		'body {',
		'	-foo: 3 2;',
		'}',
	]);
});

test('one number range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1..1;',
		'}',
	], [
		'body {',
		'	-foo: 1;',
		'}',
	]);
});

test('empty range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1...1;',
		'}',
	], [
		'body {',
		'	-foo: null;',
		'}',
	]);
});

test('percentage range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 0%..2%;',
		'}',
	], [
		'body {',
		'	-foo: 0% 1% 2%;',
		'}',
	]);
});

test('dimension range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 100px..102px;',
		'}',
	], [
		'body {',
		'	-foo: 100px 101px 102px;',
		'}',
	]);
});

test('mixed range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1px..3%;',
		'}',
	], [
		'body {',
		'	-foo: 1px 2px 3px;',
		'}',
	]);
});

test('reversed single-number mixed exclusiverange', function() {
	assert.compileTo([
		'body {',
		'	-foo: 2px...1%;',
		'}',
	], [
		'body {',
		'	-foo: 2px;',
		'}',
	]);
});

test('start number must be numberic', function() {
	assert.failAt([
		'body {',
		'	-foo: a...3;',
		'}',
	], {line: 2, column: 8});
});

test('end number must be numberic', function() {
	assert.failAt([
		'body {',
		'	-foo: 1..b;',
		'}',
	], {line: 2, column: 11});
});

suite('unary');

test('+number', function() {
	assert.compileTo([
		'body {',
		'	-foo: +1;',
		'}',
	], [
		'body {',
		'	-foo: 1;',
		'}',
	]);
});

test('+percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: +1%;',
		'}',
	], [
		'body {',
		'	-foo: 1%;',
		'}',
	]);
});

test('+dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: +1px;',
		'}',
	], [
		'body {',
		'	-foo: 1px;',
		'}',
	]);
});

test('+string, not allowed', function() {
	assert.failAt([
		'body {',
		'	-foo: +"a";',
		'}',
	], {line: 2, column: 8});
});

test('-number', function() {
	assert.compileTo([
		'body {',
		'	-foo: -1;',
		'}',
	], [
		'body {',
		'	-foo: -1;',
		'}',
	]);
});

test('-percentage', function() {
	assert.compileTo([
		'body {',
		'	-foo: -1%;',
		'}',
	], [
		'body {',
		'	-foo: -1%;',
		'}',
	]);
});

test('-dimension', function() {
	assert.compileTo([
		'body {',
		'	-foo: -1px;',
		'}',
	], [
		'body {',
		'	-foo: -1px;',
		'}',
	]);
});

test('-variable, value is number', function() {
	assert.compileTo([
		'$foo = 1px;',
		'body {',
		'	-foo: -$foo;',
		'}',
	], [
		'body {',
		'	-foo: -1px;',
		'}',
	]);
});

test('-variable, value is identifier', function() {
	assert.compileTo([
		'$foo = foo;',
		'body {',
		'	-foo: -$foo;',
		'}',
	], [
		'body {',
		'	-foo: -foo;',
		'}',
	]);
});

suite('expression');

test('number + number - number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 2 - 1;',
		'}',
	], [
		'body {',
		'	-foo: 2;',
		'}',
	]);
});

test('number / number * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 / 2 * -3;',
		'}',
	], [
		'body {',
		'	-foo: -1.5;',
		'}',
	]);
});

test('number + number * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 2 * 3;',
		'}',
	], [
		'body {',
		'	-foo: 7;',
		'}',
	]);
});

test('(number + number) * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: (1 + 2) * 3;',
		'}',
	], [
		'body {',
		'	-foo: 9;',
		'}',
	]);
});

test('number > number is boolean', function() {
	assert.compileTo([
		'body {',
		'	-foo: -1 > 1 is false;',
		'}',
	], [
		'body {',
		'	-foo: true;',
		'}',
	]);
});

test('number + number .. number * number', function() {
	assert.compileTo([
		'body {',
		'	-foo: 1 + 1 .. 2 * 2;',
		'}',
	], [
		'body {',
		'	-foo: 2 3 4;',
		'}',
	]);
});

test('list containing empty range', function() {
	assert.compileTo([
		'body {',
		'	-foo: 3 1 + 1 ... 1 * 2;',
		'}',
	], [
		'body {',
		'	-foo: 3 null;',
		'}',
	]);
});

suite('media query');


test('media type', function() {
	assert.compileTo([
		'@media print {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media print {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('media type with prefix', function() {
	assert.compileTo([
		'@media not screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media not screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('media feature', function() {
	assert.compileTo([
		'@media (max-width: 980px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media (max-width: 980px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('media feature without value', function() {
	assert.compileTo([
		'@media (color) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media (color) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('media query', function() {
	assert.compileTo([
		'@media only screen and (color) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media only screen and (color) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('nest media query under media query', function() {
	assert.compileTo([
		'@media screen {',
		'	@media (color) {',
		'		body {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'@media screen and (color) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('nest media query list under media query', function() {
	assert.compileTo([
		'@media screen {',
		'	@media (max-width: 980px), (max-width: 560px) {',
		'		body {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'@media',
		'screen and (max-width: 980px),',
		'screen and (max-width: 560px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('nest media query under media query list', function() {
	assert.compileTo([
		'@media screen, print {',
		'	@media (max-width: 980px) {',
		'		body {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'@media',
		'screen and (max-width: 980px),',
		'print and (max-width: 980px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('nest media query list under media query list', function() {
	assert.compileTo([
		'@media screen, print {',
		'	@media (max-width: 980px), (max-width: 560px) {',
		'		body {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'@media',
		'screen and (max-width: 980px),',
		'screen and (max-width: 560px),',
		'print and (max-width: 980px),',
		'print and (max-width: 560px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('deeply nest media query', function() {
	assert.compileTo([
		'@media screen {',
		'	body {',
		'		width: auto;',
		'		@media (color) {',
		'			@media (monochrome) {',
		'				height: auto;',
		'			}',
		'		}',
		'',
		'		div {',
		'			height: auto;',
		'		}',
		'	}',
		'',
		'	@media (monochrome) {',
		'		p {',
		'			margin: 0;',
		'		}',
		'	}',
		'}',
	], [
		'@media screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'		body div {',
		'			height: auto;',
		'		}',
		'}',
		'	@media screen and (color) and (monochrome) {',
		'		body {',
		'			height: auto;',
		'		}',
		'	}',
		'	@media screen and (monochrome) {',
		'		p {',
		'			margin: 0;',
		'		}',
		'	}',
	]);
});

test('interpolating media query', function() {
	assert.compileTo([
		'$qry = "not  screen";',
		'@media $qry {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media not screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('interpolating media query into media query', function() {
	assert.compileTo([
		'$qry = "( max-width: 980px )";',
		'@media screen and $qry {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media screen and (max-width: 980px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('interpolating media query into media query list', function() {
	assert.compileTo([
		'$qry1 = " only screen  and (max-width: 980px) ";',
		'$qry2 = "(max-width: 560px)";',
		'@media $qry1, $qry2 {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media',
		'only screen and (max-width: 980px),',
		'(max-width: 560px) {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('interpolating identifier', function() {
	assert.compileTo([
		'$qry = screen;',
		'@media $qry {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('not allow interpolating invalid media query', function() {
	assert.failAt([
		'$qry = "screen @";',
		'@media $qry {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], {line: 2, column: 8});
});

test('allow nesting media type', function() {
	assert.compileTo([
		'@media screen {',
		'	@media not print {',
		'		body {',
		'			width: auto;',
		'		}',
		'	}',
		'}',
	], [
		'@media screen and not print {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

suite('@media');

test('not allow containing properties at root level', function() {
	assert.failAt([
		'@media screen {',
		'	width: auto;',
		'}',
	], {line: 1, column: 1});
});

test('nest inside ruleset', function() {
	assert.compileTo([
		'body {',
		'	@media screen {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'@media screen {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	]);
});

test('remove empty @media', function() {
	assert.compileTo([
		'@media screen {',
		'	body {',
		'		$width = 980px;',
		'	}',
		'}',
	], [
		'',
	]);
});

suite('@import');

test('import with string', function() {
	assert.compileTo({imports: {
		'base.roo': [
			'body {',
			'	margin: 0;',
			'}',
		]
	}}, [
		'@import "base";',
	], [
		'body {',
		'	margin: 0;',
		'}',
	]);
});

test('import with url()', function() {
	assert.compileTo([
		'@import url(base);',
	], [
		'@import url(base);',
	]);
});

test('import with url starting with protocol', function() {
	assert.compileTo([
		'@import "http://example.com/style";',
	], [
		'@import "http://example.com/style";',
	]);
});

test('import with media query', function() {
	assert.compileTo([
		'@import "base" screen;',
	], [
		'@import "base" screen;',
	]);
});

test('nest under ruleset', function() {
	assert.compileTo({imports: {
		'base.roo': [
			'body {',
			'	margin: 0;',
			'}',
		]
	}}, [
		'html {',
		'	@import "base";',
		'}',
	], [
		'html body {',
		'	margin: 0;',
		'}',
	]);
});

test('recursively import', function() {
	assert.compileTo({imports: {
		'reset.roo': [
			'body {',
			'	margin: 0;',
			'}',
		],
		'button.roo': [
			'@import "reset";',
			'',
			'.button {',
			'	display: inline-block;',
			'}',
		]
	}}, [
		'@import "button";',
	], [
		'body {',
		'	margin: 0;',
		'}',
		'',
		'.button {',
		'	display: inline-block;',
		'}',
	]);
});

test('import same file multiple times', function() {
	assert.compileTo({imports: {
		'reset.roo': [
			'body {',
			'	margin: 0;',
			'}',
		],
		'button.roo': [
			'@import "reset";',
			'',
			'.button {',
			'	display: inline-block;',
			'}',
		],
		'tabs.roo': [
			'@import "reset";',
			'',
			'.tabs {',
			'	overflow: hidden;',
			'}',
		]
	}}, [
		'@import "button";',
		'@import "tabs";',
	], [
		'body {',
		'	margin: 0;',
		'}',
		'',
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'.tabs {',
		'	overflow: hidden;',
		'}',
	]);
});

test('recursively import files of the same directory', function() {
	assert.compileTo({imports: {
		'tabs/tab.roo': [
			'.tab {',
			'	float: left;',
			'}',
		],
		'tabs/index.roo': [
			'@import "tab";',
			'',
			'.tabs {',
			'	overflow: hidden;',
			'}',
		]
	}}, [
		'@import "tabs/index";',
	], [
		'.tab {',
		'	float: left;',
		'}',
		'',
		'.tabs {',
		'	overflow: hidden;',
		'}',
	]);
});

test('recursively import files of different directories', function() {
	assert.compileTo({imports: {
		'reset.roo': [
			'body {',
			'	margin: 0;',
			'}',
		],
		'tabs/index.roo': [
			'@import "../reset";',
			'',
			'.tabs {',
			'	overflow: hidden;',
			'}',
		]
	}}, [
		'@import "tabs/index";',
	], [
		'body {',
		'	margin: 0;',
		'}',
		'',
		'.tabs {',
		'	overflow: hidden;',
		'}',
	]);
});

test('import empty file', function() {
	assert.compileTo({imports: {
		'var.roo': [
			'$width = 980px;',
		]
	}}, [
		'@import "var";',
		'',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 980px;',
		'}',
	]);
});

test('not importing file with variables in the path', function() {
	assert.compileTo([
		'$path = "tabs";',
		'@import $path;',
	], [
		'@import "tabs";',
	]);
});

test('not allow importing file has syntax error', function() {
	assert.failAt({imports: {
		'base.roo': [
			'body # {',
			'	margin: 0;',
			'}',
		]
	}}, [
		'@import "base";',
	], {line: 1, column: 7, fileName: 'base.roo'});
});

suite('@extend');

test('extend selector', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button,',
		'#submit {',
		'	display: inline-block;',
		'}',
	]);
});

test('ignore following selectors', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
		'',
		'.button {',
		'	display: block;',
		'}',
	], [
		'.button,',
		'#submit {',
		'	display: inline-block;',
		'}',
		'',
		'.button {',
		'	display: block;',
		'}',
	]);
});

test('extend selector containing nested selector', function() {
	assert.compileTo([
		'.button {',
		'	.icon {',
		'		display:block;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button .icon,',
		'#submit .icon {',
		'	display: block;',
		'}',
	]);
});

test('extend selector containing deeply nested selector', function() {
	assert.compileTo([
		'.button {',
		'	.icon {',
		'		img {',
		'			display:block;',
		'		}',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button .icon img,',
		'#submit .icon img {',
		'	display: block;',
		'}',
	]);
});

test('extend compound selector', function() {
	assert.compileTo([
		'.button {',
		'	& .icon {',
		'		float: left;',
		'	}',
		'}',
		'',
		'#submit .icon {',
		'	@extend .button .icon;',
		'}',
	], [
		'.button .icon,',
		'#submit .icon {',
		'	float: left;',
		'}',
	]);
});

test('extend selector containing nested & selector', function() {
	assert.compileTo([
		'.button {',
		'	& .icon {',
		'		float: left;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button .icon,',
		'#submit .icon {',
		'	float: left;',
		'}',
	]);
});

test('extend selector with selector list', function() {
	assert.compileTo([
		'.button .icon {',
		'	float: left;',
		'}',
		'',
		'#submit .icon, #reset .icon {',
		'	@extend .button .icon;',
		'}',
	], [
		'.button .icon,',
		'#submit .icon,',
		'#reset .icon {',
		'	float: left;',
		'}',
	]);
});

test('deeply extend selector', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'.large-button {',
		'	@extend .button;',
		'	display: block;',
		'}',
		'',
		'#submit {',
		'	@extend .large-button;',
		'}',
	], [
		'.button,',
		'.large-button,',
		'#submit {',
		'	display: inline-block;',
		'}',
		'',
		'.large-button,',
		'#submit {',
		'	display: block;',
		'}',
	]);
});

test('extend selector under the same ruleset', function() {
	assert.compileTo([
		'.button {',
		'	.icon {',
		'		float: left;',
		'	}',
		'',
		'	.large-icon {',
		'		@extend .button .icon;',
		'	}',
		'}',
	], [
		'.button .icon,',
		'.button .large-icon {',
		'	float: left;',
		'}',
	]);
});

// don't want to test for selector equalify when extending
// since this scenario might never happen
// resulting in duplicate selectors is acceptable
test('extend self', function() {
	assert.compileTo([
		'.button {',
		'	.icon {',
		'		float: left;',
		'	}',
		'',
		'	.icon {',
		'		@extend .button .icon;',
		'		display: block;',
		'	}',
		'}',
	], [
		'.button .icon,',
		'.button .icon {',
		'	float: left;',
		'}',
		'',
		'.button .icon,',
		'.button .icon {',
		'	display: block;',
		'}',
	]);
});

test('extend by multiple selectors', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
		'',
		'#reset {',
		'	@extend .button;',
		'}',
	], [
		'.button,',
		'#submit,',
		'#reset {',
		'	display: inline-block;',
		'}',
	]);
});

test('extend selector containing selector by multiple selectors', function() {
	assert.compileTo([
		'.button {',
		'	.icon {',
		'		float: left;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
		'',
		'#reset {',
		'	@extend .button;',
		'}',
	], [
		'.button .icon,',
		'#submit .icon,',
		'#reset .icon {',
		'	float: left;',
		'}',
	]);
});

test('extend selector containg nested @media', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'	@media screen {',
		'		display: block;',
		'	}',
		'	@media print {',
		'		display: none;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button,',
		'#submit {',
		'	display: inline-block;',
		'}',
		'	@media screen {',
		'		.button,',
		'		#submit {',
		'			display: block;',
		'		}',
		'	}',
		'	@media print {',
		'		.button,',
		'		#submit {',
		'			display: none;',
		'		}',
		'	}',
	]);
});

test('extend selector nested under same @media', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'@media print {',
		'	.button {',
		'		display: block;',
		'	}',
		'}',
		'',
		'@media not screen {',
		'	.button {',
		'		display: block;',
		'	}',
		'',
		'	#submit {',
		'		@extend .button;',
		'	}',
		'}',
	], [
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'@media print {',
		'	.button {',
		'		display: block;',
		'	}',
		'}',
		'',
		'@media not screen {',
		'	.button,',
		'	#submit {',
		'		display: block;',
		'	}',
		'}',
	]);
});

test('extend selector nested under @media with same media query', function() {
	assert.compileTo([
		'@media screen {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'',
		'	@media (color), (monochrome) {',
		'		.button {',
		'			display: block;',
		'		}',
		'	}',
		'',
		'	@media (color) {',
		'		.button {',
		'			display: inline-block;',
		'		}',
		'	}',
		'}',
		'',
		'@media screen and (color) {',
		'	#submit {',
		'		@extend .button;',
		'	}',
		'}',
	], [
		'@media screen {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
		'	@media',
		'	screen and (color),',
		'	screen and (monochrome) {',
		'		.button {',
		'			display: block;',
		'		}',
		'	}',
		'	@media screen and (color) {',
		'		.button,',
		'		#submit {',
		'			display: inline-block;',
		'		}',
		'	}',
	]);
});

test('ignore following @media', function() {
	assert.compileTo([
		'@media screen and (color) {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
		'',
		'@media screen and (color) {',
		'	#submit {',
		'		@extend .button;',
		'	}',
		'}',
		'',
		'@media screen and (color) {',
		'	.button {',
		'		display: block;',
		'	}',
		'}',
	], [
		'@media screen and (color) {',
		'	.button,',
		'	#submit {',
		'		display: inline-block;',
		'	}',
		'}',
		'',
		'@media screen and (color) {',
		'	.button {',
		'		display: block;',
		'	}',
		'}',
	]);
});

test('extend selector in the imported file', function() {
	assert.compileTo({imports: {
		'button.roo': [
			'.button {',
			'	display: inline-block;',
			'}',
		]
	}}, [
		'@import "button";',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'.button,',
		'#submit {',
		'	display: inline-block;',
		'}',
	]);
});

test('not extending selector in the importing file', function() {
	assert.compileTo({imports: {
		'button.roo': [
			'#submit {',
			'	@extend .button;',
			'	display: block;',
			'}',
		]
	}}, [
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'@import "button";',
	], [
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	display: block;',
		'}',
	]);
});

suite('@void');

test('unextended ruleset', function() {
	assert.compileTo([
		'@void {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('extended ruleset', function() {
	assert.compileTo([
		'@void {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
	], [
		'#submit {',
		'	display: inline-block;',
		'}',
	]);
});
test('extend ruleset inside @void', function() {
	assert.compileTo([
		'@void {',
		'	.button {',
		'		display: inline-block;',
		'		.icon {',
		'			float: left;',
		'		}',
		'	}',
		'',
		'	.large-button {',
		'		@extend .button;',
		'		display: block;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .large-button;',
		'}',
	], [
		'#submit {',
		'	display: inline-block;',
		'}',
		'	#submit .icon {',
		'		float: left;',
		'	}',
		'',
		'#submit {',
		'	display: block;',
		'}',
	]);
});

test('extend ruleset outside @void has no effect', function() {
	assert.compileTo([
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'@void {',
		'	.button {',
		'		display: block;',
		'	}',
		'',
		'	.large-button {',
		'		@extend .button;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .large-button;',
		'}',
	], [
		'.button {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	display: block;',
		'}',
	]);
});

test('nest @import under @void', function() {
	assert.compileTo({imports: {
		'button.roo': [
			'.button {',
			'	display: inline-block;',
			'}',
			'',
			'.large-button {',
			'	@extend .button;',
			'	width: 100px;',
			'}',
		]
	}}, [
		'@void {',
		'	@import "button";',
		'}',
		'',
		'#submit {',
		'	@extend .large-button;',
		'}',
	], [
		'#submit {',
		'	display: inline-block;',
		'}',
		'',
		'#submit {',
		'	width: 100px;',
		'}',
	]);
});

suite('@if');

test('true condition', function() {
	assert.compileTo([
		'@if true {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('list as true condition', function() {
	assert.compileTo([
		'@if "", "" {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('false condition', function() {
	assert.compileTo([
		'@if false {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
		]);
});

test('0 as false condition', function() {
	assert.compileTo([
		'@if 0 {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('0% as false condition', function() {
	assert.compileTo([
		'@if 0% {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('0px as false condition', function() {
	assert.compileTo([
		'@if 0px {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('empty string as false condition', function() {
	assert.compileTo([
		'@if "" {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('@else if', function() {
	assert.compileTo([
		'body {',
		'	@if false {',
		'		width: auto;',
		'	} @else if true {',
		'		height: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	height: auto;',
		'}',
	]);
});

test('short-ciruit @else if', function() {
	assert.compileTo([
		'body {',
		'	@if false {',
		'		width: auto;',
		'	} @else if false {',
		'		height: auto;',
		'	} @else if true {',
		'		margin: auto;',
		'	} @else if true {',
		'		padding: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	margin: auto;',
		'}',
	]);
});

test('@else', function() {
	assert.compileTo([
		'body {',
		'	@if false {',
		'		width: auto;',
		'	} @else {',
		'		height: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	height: auto;',
		'}',
	]);
});

test('@else with @else if', function() {
	assert.compileTo([
		'body {',
		'	@if false {',
		'		width: auto;',
		'	} @else if false {',
		'		height: auto;',
		'	} @else {',
		'		margin: auto;',
		'	}',
		'}',
	], [
		'body {',
		'	margin: auto;',
		'}',
	]);
});

suite('@for');

test('loop natural range', function() {
	assert.compileTo([
		'@for $i in 1..3 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
		'',
		'.span-2 {',
		'	width: 120px;',
		'}',
		'',
		'.span-3 {',
		'	width: 180px;',
		'}',
	]);
});

test('loop natural exclusive range', function() {
	assert.compileTo([
		'@for $i in 1...3 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
		'',
		'.span-2 {',
		'	width: 120px;',
		'}',
	]);
});

test('loop one number range', function() {
	assert.compileTo([
		'@for $i in 1..1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
	]);
});

test('loop empty range', function() {
	assert.compileTo([
		'@for $i in 1...1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'',
	]);
});

test('loop reversed range', function() {
	assert.compileTo([
		'@for $i in 3..1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-3 {',
		'	width: 180px;',
		'}',
		'',
		'.span-2 {',
		'	width: 120px;',
		'}',
		'',
		'.span-1 {',
		'	width: 60px;',
		'}',
	]);
});

test('loop reversed exclusive range', function() {
	assert.compileTo([
		'@for $i in 3...1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-3 {',
		'	width: 180px;',
		'}',
		'',
		'.span-2 {',
		'	width: 120px;',
		'}',
	]);
});

test('loop with positive step', function() {
	assert.compileTo([
		'@for $i by 2 in 1..4 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
		'',
		'.span-3 {',
		'	width: 180px;',
		'}',
	]);
});

test('loop with positive step for reversed range', function() {
	assert.compileTo([
		'@for $i by 2 in 3..1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-3 {',
		'	width: 180px;',
		'}',
		'',
		'.span-1 {',
		'	width: 60px;',
		'}',
	]);
});

test('loop with negative step', function() {
	assert.compileTo([
		'@for $i by -1 in 1...3 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-2 {',
		'	width: 120px;',
		'}',
		'',
		'.span-1 {',
		'	width: 60px;',
		'}',
	]);
});

test('loop with negative step for reversed range', function() {
	assert.compileTo([
		'@for $i by -2 in 3..1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
		'',
		'.span-3 {',
		'	width: 180px;',
		'}',
	]);
});

test('not allow step number to be zero', function() {
	assert.failAt([
		'@for $i by 0 in 1..3 {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], {line: 1, column: 12});
});

test('only allow step number to be numberic', function() {
	assert.failAt([
		'@for $i by a in 1..3 {',
		'	body {',
		'		width: auto;',
		'	}',
		'}',
	], {line: 1, column: 12});
});

test('loop list', function() {
	assert.compileTo([
		'$icons = foo bar, qux;',
		'@for $icon in $icons {',
		'	.icon-$icon {',
		'		content: "$icon";',
		'	}',
		'}',
	], [
		'.icon-foo {',
		'	content: "foo";',
		'}',
		'',
		'.icon-bar {',
		'	content: "bar";',
		'}',
		'',
		'.icon-qux {',
		'	content: "qux";',
		'}',
	]);
});

test('loop number', function() {
	assert.compileTo([
		'@for $i in 1 {',
		'	.span-$i {',
		'		width: $i * 60px;',
		'	}',
		'}',
	], [
		'.span-1 {',
		'	width: 60px;',
		'}',
	]);
});

test('loop null', function() {
	assert.compileTo([
		'@for $i in null {',
		'	body {',
		'		margin: 0;',
		'	}',
		'}',
		'',
		'body {',
		'	-foo: $i;',
		'}',
	], [
		'body {',
		'	-foo: null;',
		'}',
	]);
});

test('loop list with index', function() {
	assert.compileTo([
		'@for $icon, $i in foo bar, qux {',
		'	.icon-$icon {',
		'		content: "$i $icon";',
		'	}',
		'}',
	], [
		'.icon-foo {',
		'	content: "0 foo";',
		'}',
		'',
		'.icon-bar {',
		'	content: "1 bar";',
		'}',
		'',
		'.icon-qux {',
		'	content: "2 qux";',
		'}',
	]);
});

test('loop list with index with negative step', function() {
	assert.compileTo([
		'@for $icon, $i by -1 in foo bar, qux {',
		'	.icon-$icon {',
		'		content: "$i $icon";',
		'	}',
		'}',
	], [
		'.icon-qux {',
		'	content: "2 qux";',
		'}',
		'',
		'.icon-bar {',
		'	content: "1 bar";',
		'}',
		'',
		'.icon-foo {',
		'	content: "0 foo";',
		'}',
	]);
});

test('loop value with index', function() {
	assert.compileTo([
		'@for $icon, $i in foo {',
		'	.icon-$icon {',
		'		content: "$i $icon";',
		'	}',
		'}',
	], [
		'.icon-foo {',
		'	content: "0 foo";',
		'}',
	]);
});

test('loop null with index', function() {
	assert.compileTo([
		'@for $value, $i in null {}',
		'',
		'body {',
		'	-foo: $value $i;',
		'}',
	], [
		'body {',
		'	-foo: null null;',
		'}',
	]);
});

suite('mixin');

test('mixin rules', function() {
	assert.compileTo([
		'$property = @function {',
		'	width: auto;',
		'};',
		'',
		'body {',
		'	@mixin $property();',
		'}',
	], [
		'body {',
		'	width: auto;',
		'}',
	]);
});

test('ignore @return', function() {
	assert.compileTo([
		'$rules = @function {',
		'	width: auto;',
		'	@return 960px;',
		'	height: auto;',
		'};',
		'',
		'body {',
		'	@mixin $rules();',
		'}',
	], [
		'body {',
		'	width: auto;',
		'	height: auto;',
		'}',
	]);
});

suite('@keyframes');

test('remove empty @keyframes', function() {
	assert.compileTo([
		'@keyframes name {}',
	], [
		'',
	]);
});

test('remove empty keyframe block', function() {
	assert.compileTo([
		'@keyframes name {',
		'	0% {}',
		'}',
	], [
		'',
	]);
});

test('prefixed @keyframes', function() {
	assert.compileTo([
		'@-webkit-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	]);
});

test('from to', function() {
	assert.compileTo([
		'@-webkit-keyframes name {',
		'	from {',
		'		top: 0;',
		'	}',
		'	to {',
		'		top: 100px;',
		'	}',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	from {',
		'		top: 0;',
		'	}',
		'	to {',
		'		top: 100px;',
		'	}',
		'}',
	]);
});

test('keyframe selector list', function() {
	assert.compileTo([
		'@-webkit-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	50%, 60% {',
		'		top: 50px;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	50%, 60% {',
		'		top: 50px;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	]);
});

test('unprefixed @keyframes', function() {
	assert.compileTo([
		'@keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
		'',
		'@-moz-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
		'',
		'@-o-keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
		'',
		'@keyframes name {',
		'	0% {',
		'		top: 0;',
		'	}',
		'	100% {',
		'		top: 100px;',
		'	}',
		'}',
	]);
});

test('contain property needs to be prefixed', function() {
	assert.compileTo([
		'@keyframes name {',
		'	from {',
		'		border-radius: 0;',
		'	}',
		'	to {',
		'		border-radius: 10px;',
		'	}',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	from {',
		'		-webkit-border-radius: 0;',
		'		border-radius: 0;',
		'	}',
		'	to {',
		'		-webkit-border-radius: 10px;',
		'		border-radius: 10px;',
		'	}',
		'}',
		'',
		'@-moz-keyframes name {',
		'	from {',
		'		-moz-border-radius: 0;',
		'		border-radius: 0;',
		'	}',
		'	to {',
		'		-moz-border-radius: 10px;',
		'		border-radius: 10px;',
		'	}',
		'}',
		'',
		'@-o-keyframes name {',
		'	from {',
		'		border-radius: 0;',
		'	}',
		'	to {',
		'		border-radius: 10px;',
		'	}',
		'}',
		'',
		'@keyframes name {',
		'	from {',
		'		border-radius: 0;',
		'	}',
		'	to {',
		'		border-radius: 10px;',
		'	}',
		'}',
	]);
});

suite('@font-face');

test('remove empty @font-face', function() {
	assert.compileTo([
		'@font-face {}',
	], [
		'',
	]);
});

test('@font-face', function() {
	assert.compileTo([
		'@font-face {',
		'	font-family: font;',
		'}',
	], [
		'@font-face {',
		'	font-family: font;',
		'}',
	]);
});

suite('@module');

test('default separator', function() {
	assert.compileTo([
		'@module foo {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
	], [
		'.foo-button {',
		'	display: inline-block;',
		'}',
	]);
});

test('specify separator', function() {
	assert.compileTo([
		'@module foo with "--" {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
	], [
		'.foo--button {',
		'	display: inline-block;',
		'}',
	]);
});

test('nested selectors', function() {
	assert.compileTo([
		'@module foo {',
		'	.tabs .tab {',
		'		float: left;',
		'	}',
		'}',
	], [
		'.foo-tabs .foo-tab {',
		'	float: left;',
		'}',
	]);
});

test('chained selectors', function() {
	assert.compileTo([
		'@module foo {',
		'	.button.active {',
		'		display: inline-block;',
		'	}',
		'}',
	], [
		'.foo-button.foo-active {',
		'	display: inline-block;',
		'}',
	]);
});

test('nested modules', function() {
	assert.compileTo([
		'@module foo {',
		'	@module bar {',
		'		.button {',
		'			display: inline-block;',
		'		}',
		'	}',
		'}',
	], [
		'.foo-bar-button {',
		'	display: inline-block;',
		'}',
	]);
});

test('not allow invalid module name', function() {
	assert.failAt([
		'$func = @function {};',
		'@module $func {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
	], {line: 2, column: 9});
});

test('not allow invalid module separator', function() {
	assert.failAt([
		'$func = @function {};',
		'@module foo with $func {',
		'	.button {',
		'		display: inline-block;',
		'	}',
		'}',
	], {line: 2, column: 18});
});

suite('@page');

test('without page selector', function() {
	assert.compileTo([
		'@page {',
		'	margin: 2em;',
		'}',
	], [
		'@page {',
		'	margin: 2em;',
		'}',
	]);
});

test('with page selector', function() {
	assert.compileTo([
		'@page :first {',
		'	margin: 2em;',
		'}',
	], [
		'@page :first {',
		'	margin: 2em;',
		'}',
	]);
});

suite('@charset');

test('@charset', function() {
	assert.compileTo([
		'@charset "UTF-8";',
	], [
		'@charset "UTF-8";',
	]);
});

suite('scope');

test('ruleset creates new scope', function() {
	assert.compileTo([
		'$width = 980px;',
		'body {',
		'	$width = 500px;',
		'	width: $width;',
		'}',
		'html {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 500px;',
		'}',
		'',
		'html {',
		'	width: 980px;',
		'}',
	]);
});

test('@media creates new scope', function() {
	assert.compileTo([
		'$width = 980px;',
		'',
		'@media screen {',
		'	$width = 500px;',
		'	body {',
		'		width: $width;',
		'	}',
		'}',
		'',
		'html {',
		'	width: $width;',
		'}',
	], [
		'@media screen {',
		'	body {',
		'		width: 500px;',
		'	}',
		'}',
		'',
		'html {',
		'	width: 980px;',
		'}',
	]);
});

test('@import does not create new scope', function() {
	assert.compileTo({imports: {
		'base.roo': [
			'$width = 500px;',
			'body {',
			'	width: $width;',
			'}',
		]
	}}, [
		'$width = 980px;',
		'',
		'@import "base";',
		'',
		'html {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 500px;',
		'}',
		'',
		'html {',
		'	width: 500px;',
		'}',
	]);
});

test('@void creates new scope', function() {
	assert.compileTo([
		'$width = 100px;',
		'@void {',
		'	$width = 50px;',
		'	.button {',
		'		width: $width;',
		'	}',
		'}',
		'',
		'#submit {',
		'	@extend .button;',
		'}',
		'',
		'#reset {',
		'	width: $width;',
		'}',
	], [
		'#submit {',
		'	width: 50px;',
		'}',
		'',
		'#reset {',
		'	width: 100px;',
		'}',
	]);
});

test('@block creates new scope', function() {
	assert.compileTo([
		'$width = 980px;',
		'@block {',
		'	$width = 500px;',
		'	body {',
		'		width: $width;',
		'	}',
		'}',
		'html {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 500px;',
		'}',
		'',
		'html {',
		'	width: 980px;',
		'}',
	]);
});

test('@if does not create new scope', function() {
	assert.compileTo([
		'$width = 980px;',
		'',
		'@if true {',
		'	$width = 500px;',
		'}',
		'',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 500px;',
		'}',
	]);
});

test('@for does not create new scope', function() {
	assert.compileTo([
		'$width = 980px;',
		'',
		'@for $i in 1 {',
		'	$width = 500px;',
		'}',
		'',
		'body {',
		'	width: $width;',
		'}',
	], [
		'body {',
		'	width: 500px;',
		'}',
	]);
});

test('@keyframes creates new scope', function() {
	assert.compileTo([
		'$width = 960px;',
		'',
		'@-webkit-keyframes name {',
		'	$width = 400px;',
		'',
		'	from {',
		'		$width = 200px;',
		'		width: $width;',
		'	}',
		'	to {',
		'		width: $width;',
		'	}',
		'}',
		'',
		'body {',
		'	width: $width;',
		'}',
	], [
		'@-webkit-keyframes name {',
		'	from {',
		'		width: 200px;',
		'	}',
		'	to {',
		'		width: 400px;',
		'	}',
		'}',
		'',
		'body {',
		'	width: 960px;',
		'}',
	]);
});

suite('prefix');

test('box-sizing', function() {
	assert.compileTo([
		'body {',
		'	box-sizing: border-box;',
		'}',
	], [
		'body {',
		'	-webkit-box-sizing: border-box;',
		'	-moz-box-sizing: border-box;',
		'	box-sizing: border-box;',
		'}',
	]);
});

test('linear-gradient()', function() {
	assert.compileTo([
		'body {',
		'	background: linear-gradient(#000, #fff);',
		'}',
	], [
		'body {',
		'	background: -webkit-linear-gradient(#000, #fff);',
		'	background: -moz-linear-gradient(#000, #fff);',
		'	background: -o-linear-gradient(#000, #fff);',
		'	background: linear-gradient(#000, #fff);',
		'}',
	]);
});

test('linear-gradient() with starting position', function() {
	assert.compileTo([
		'body {',
		'	background: linear-gradient(to bottom, #000, #fff);',
		'}',
	], [
		'body {',
		'	background: -webkit-linear-gradient(top, #000, #fff);',
		'	background: -moz-linear-gradient(top, #000, #fff);',
		'	background: -o-linear-gradient(top, #000, #fff);',
		'	background: linear-gradient(to bottom, #000, #fff);',
		'}',
	]);
});

test('linear-gradient() with starting position consisting of two identifiers', function() {
	assert.compileTo([
		'body {',
		'	background: linear-gradient(to top left, #000, #fff);',
		'}',
	], [
		'body {',
		'	background: -webkit-linear-gradient(bottom right, #000, #fff);',
		'	background: -moz-linear-gradient(bottom right, #000, #fff);',
		'	background: -o-linear-gradient(bottom right, #000, #fff);',
		'	background: linear-gradient(to top left, #000, #fff);',
		'}',
	]);
});

test('multiple linear-gradient()', function() {
	assert.compileTo([
		'body {',
		'	background: linear-gradient(#000, #fff), linear-gradient(#111, #eee);',
		'}',
	], [
		'body {',
		'	background: -webkit-linear-gradient(#000, #fff), -webkit-linear-gradient(#111, #eee);',
		'	background: -moz-linear-gradient(#000, #fff), -moz-linear-gradient(#111, #eee);',
		'	background: -o-linear-gradient(#000, #fff), -o-linear-gradient(#111, #eee);',
		'	background: linear-gradient(#000, #fff), linear-gradient(#111, #eee);',
		'}',
	]);
});

test('background with regular value', function() {
	assert.compileTo([
		'body {',
		'	background: #fff;',
		'}',
	], [
		'body {',
		'	background: #fff;',
		'}',
	]);
});

test('skip prefixed property', function() {
	assert.compileTo({
		skipPrefixed: true
	}, [
		'body {',
		'	-moz-box-sizing: padding-box;',
		'	box-sizing: border-box;',
		'}',
	], [
		'body {',
		'	-moz-box-sizing: padding-box;',
		'	-webkit-box-sizing: border-box;',
		'	box-sizing: border-box;',
		'}',
	]);
});
