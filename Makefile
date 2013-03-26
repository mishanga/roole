DOC_CSS_FILES = \
	components/normalize-css/normalize.css \
	components/codemirror/lib/codemirror.css

DOC_ROO_FILES = \
	style/var.roo \
	style/font.roo \
	style/nav.roo \
	style/toc.roo \
	style/download-button.roo \
	style/code.roo \
	style/snippet.roo \
	style/editor.roo \
	style/theme.roo \
	style/global.roo

DOC_JS_FILES = \
	components/codemirror/lib/codemirror.js \
	build/css-mode.js \
	build/roole-mode.js \
	script/toc.js \
	script/editor.js

doc: release script/script.js style/style.css index.html test

release: dist/roole.js dist/roole.min.js dist/roole.min.js.map

dist/%: roole/dist/%
	cp -f $< $@

style/style.css: roole/bin/roole node_modules/.bin/cleancss $(DOC_CSS_FILES) $(DOC_ROO_FILES)
	cat $(DOC_CSS_FILES) >$@
	$< -p $(DOC_ROO_FILES) >>$@
	node_modules/.bin/cleancss --s0 --remove-empty --output $@ $@

script/script.js: node_modules/.bin/uglifyjs $(DOC_JS_FILES)
	$< $(DOC_JS_FILES) -cmo $@

roole/dist/roole.js:
	cd roole && $(MAKE) roole

roole/dist/roole.min.js \
roole/dist/roole.min.js.map:
	cd roole && $(MAKE) min

index.html: \
	build/md2json \
	index.md \
	roole/CHANGELOG.md \
	roole/build/mustache \
	index.mustache \
	node_modules/marked \
	node_modules/jsdom \
	roole/package.json \
	build/css-mode.js \
	build/roole-mode.js

	build/md2json index.md roole/CHANGELOG.md | \
		roole/build/mustache index.mustache >$@

test: test/test.js test/test.min.js test/test.min.js.map test/index.html test/vendor/mocha.css test/vendor/mocha.js

test/test.js: roole/test/test.js
	cp -f $< $@

test/%: roole/test/%
	cp -f $< $@

test/vendor/mocha.js: node_modules/.bin/uglifyjs roole/test/vendor/mocha.js
	$< roole/test/vendor/mocha.js -cmo $@

test/vendor/mocha.css: node_modules/.bin/cleancss roole/test/vendor/mocha.css
	$< --s0 -eo $@ roole/test/vendor/mocha.css

roole/test/%:
	cd roole && make browser-test

merge:
	git merge -Xsubtree=roole -m "Merge branch 'master' into gh-pages" master

node_modules/%:
	npm install

components/%: node_modules/.bin/bower
	$< install

clean:
	cd roole && $(MAKE) clean

.PHONY: roole doc release clean