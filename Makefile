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

doc: roole release script/script.js style/style.css index.html test

release: dist/roole.js dist/roole.min.js

dist/roole.js: roole/dist/roole.js | dist
	cp -f $< $@

dist/roole.min.js: roole/dist/roole.min.js | dist
	cp -f $< $@

LATEST_TAG = $(shell git describe --abbrev=0 master)
roole:
	git merge -Xsubtree=roole $(LATEST_TAG) -m 'subtree merge latest tag into roole folder'

style/style.css: roole/bin/roole $(DOC_CSS_FILES) $(DOC_ROO_FILES)
	cat $(DOC_CSS_FILES) >$@
	roole/bin/roole -p $(DOC_ROO_FILES) >>$@

script/script.js: $(DOC_JS_FILES) roole/node_modules/.bin/uglifyjs
	roole/node_modules/.bin/uglifyjs $(DOC_JS_FILES) -cmo $@

roole/dist/roole.js: .FORCE
	cd roole && $(MAKE) roole

roole/dist/roole.min.js: .FORCE
	cd roole && $(MAKE) min

index.html: \
	node_modules/.bin/marked \
	index.md \
	build/parse-index \
	roole/build/mustache \
	index.mustache \
	roole/package.json \
	build/css-mode.js \
	build/roole-mode.js

	$< --breaks --lang-prefix '' $(word 2,$^) | $(word 3,$^) | $(word 4,$^) $(word 5,$^) >$@

test: test/test.js test/index.html test/mocha.css test/mocha.js

test/test.js: roole/test/test.js
	cp -f $< $@

roole/test/test.js: .FORCE
	cd roole && make browser-test

test/index.html: roole/test/index.html
	sed -e 's%../node_modules/mocha/%%' $< >$@

test/mocha.%: roole/node_modules/mocha/mocha.%
	cp -f $< $@

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

.FORCE:

.PHONY: roole doc release clean