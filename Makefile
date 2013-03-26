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

doc: dist/roole.js dist/roole.min.js script/script.js style/style.css index.html test

dist/roole.js: roole/dist/roole.js | dist
	cp -f $< $@

dist/roole.min.js: roole/dist/roole.min.js | dist
	cp -f $< $@

style/style.css: roole/bin/roole node_modules/.bin/cleancss $(DOC_CSS_FILES) $(DOC_ROO_FILES)
	cat $(DOC_CSS_FILES) >$@
	$< -p $(DOC_ROO_FILES) >>$@
	$(word 2,$^) --s0 --remove-empty --output $@ $@

script/script.js: $(DOC_JS_FILES) roole/node_modules/.bin/uglifyjs
	roole/node_modules/.bin/uglifyjs $(DOC_JS_FILES) -cmo $@

roole/dist/roole.js:
	cd roole && $(MAKE) roole

roole/dist/roole.min.js:
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

test: test/test.js test/index.html test/mocha.css test/mocha.js

test/test.js: roole/test/test.js
	cp -f $< $@

roole/test/test.js:
	cd roole && make browser-test

test/index.html: roole/test/index.html
	sed -e 's%../node_modules/mocha/%%' $< >$@

test/mocha.%: roole/node_modules/mocha/mocha.%
	cp -f $< $@

merge:
	git merge -Xsubtree=roole -m "Merge branch 'master' into gh-pages" master

node_modules/%:
	npm install

roole/node_modules/%:
	cd roole && npm install

components/%: node_modules/.bin/bower
	$< install

dist:
	mkdir $@

clean:
	cd roole && $(MAKE) clean

.PHONY: roole doc release clean