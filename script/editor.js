var Editor = function() {
	var element = document.getElementById('editor')
	var contentElement = element.getElementsByClassName('content')[0]
	var resizerElement = element.getElementsByClassName('resizer')[0]
	var inputElement = element.getElementsByClassName('input')[0]
	var textareaElement = inputElement.getElementsByTagName('textarea')[0]
	var outputElement = element.getElementsByClassName('output')[0]
	var errorElement = outputElement.getElementsByClassName('error')[0]
	var errorContentElement = errorElement.getElementsByClassName('content')[0]
	var errorArrowElement = errorElement.getElementsByClassName('arrow')[0]
	var togglerElement = document.querySelector('#nav a[href="#editor"]')

	errorElement.parentNode.removeChild(errorElement)
	errorElement.classList.remove('hidden')

	this.element = element
	this.contentElement = contentElement
	this.resizerElement = resizerElement
	this.inputElement = inputElement
	this.textareaElement = textareaElement
	this.outputElement = outputElement
	this.errorElement = errorElement
	this.errorContentElement = errorContentElement
	this.errorArrowElement = errorArrowElement
	this.togglerElement = togglerElement

	this.inputEditor = this.createInputEditor()
	this.outputEditor = this.createOutputEditor()

	this.dragToResize()
	this.typeToCompile()
	this.clickToToggle()
	this.lockScroll()

	this.compileInput()
	this.hide()
	// make sure editor is moved out of view before
	// class name is removed, otherwise transition will be triggered
	setTimeout(function() {
		element.classList.remove('hidden')
	}, 0)
}

Editor.prototype.dragToResize = function() {
	this.resizerElement.addEventListener('mousedown', function(event) {
		event.preventDefault()

		var start = event.pageY
		var height = this.getContentHeight()
		var mousemove = function(event) {
			var end = event.pageY
			var distance = end - start
			this.setContentHeight(height + distance)
		}.bind(this)

		document.addEventListener('mousemove', mousemove, false)
		document.addEventListener('mouseup', function() {
			document.removeEventListener('mousemove', mousemove, false)
		}, false)
	}.bind(this), false)
}


Editor.prototype.getContentHeight = function() {
	var style = getComputedStyle(this.contentElement)
	return parseInt(style.height, 10)
}

Editor.prototype.setContentHeight = function(height) {
	if (height < 0) height = 0
	this.contentElement.style.height = height + 'px'
}

Editor.prototype.typeToCompile = function() {
	var timer
	this.inputEditor.on('change', function() {
		clearTimeout(timer)
		timer = setTimeout(this.compileInput.bind(this), 400)
	}.bind(this))
}

Editor.prototype.compileInput = function() {
	var input = this.inputEditor.getValue()
	this.hideError()
	roole.compile(input, function(error, output) {
		if (error)
			this.showError(error)
		else
			this.outputEditor.setValue(output)
	}.bind(this))
}

Editor.prototype.createInputEditor = function() {
	var cm = CodeMirror.fromTextArea(this.textareaElement, {
		mode: 'roole',
		theme: 'tomorrow',
		tabSize: 2,
		autofocus: true,
		dragDrop: false,
		lineNumbers: true,
		extraKeys: {
			Tab: function(cm) {
				var spaces = new Array(cm.getOption("indentUnit") + 1).join(" ")
				cm.replaceSelection(spaces, "end", "+input")
			}
		}
	})

	cm.getWrapperElement().classList.add('lang-roole')
	return cm
}

Editor.prototype.createOutputEditor = function() {
	var cm = CodeMirror(this.outputElement, {
		mode: 'css',
		theme: 'tomorrow',
		tabSize: 2,
		readOnly: 'nocursor',
		lineNumbers: true
	})

	cm.getWrapperElement().classList.add('lang-css')
	return cm
}

Editor.prototype.hideError = function() {
	if (!this.hasError)
		return

	this.hasError = false

	this.outputEditor.removeLineWidget(this.lineWidget)
	this.outputElement.classList.remove('error')
	this.outputEditor.getWrapperElement().classList.remove('lang-roole')
	this.outputEditor.getWrapperElement().classList.add('lang-css')
}

Editor.prototype.showError = function(error) {
	this.hasError = true

	this.outputElement.classList.add('error')
	this.outputEditor.getWrapperElement().classList.remove('lang-css')
	this.outputEditor.getWrapperElement().classList.add('lang-roole')
	this.outputEditor.setValue(this.inputEditor.getValue())

	var pos = {line: error.line - 1, ch: error.column - 1}
	var coords = this.outputEditor.cursorCoords(pos, 'local')
	this.errorContentElement.textContent = error.message
	this.errorArrowElement.style.left = coords.left + 'px'
	this.clickErrorElementToMoveCursor(pos)

	this.lineWidget = this.outputEditor.addLineWidget(pos.line, this.errorElement)
	var lineWidgetElement = this.errorElement.parentNode.parentNode
	this.outputEditor.scrollIntoView({
		top: lineWidgetElement.offsetTop,
		left: lineWidgetElement.offsetLeft,
		bottom: lineWidgetElement.offsetTop + lineWidgetElement.offsetHeight,
		right: lineWidgetElement.offsetLeft + lineWidgetElement.offsetWidth
	})
}

Editor.prototype.clickErrorElementToMoveCursor = function(pos) {
	var inputEditor = this.inputEditor
	this.errorElement.onclick = function() {
		inputEditor.focus()
		inputEditor.setCursor(pos)
	}
}

Editor.prototype.clickToToggle = function() {
	this.togglerElement.addEventListener('click', function(event) {
		event.preventDefault()
		this.toggle()
	}.bind(this), false)
}

Editor.prototype.toggle = function() {
	if (this.visible)
		this.hide()
	else
		this.show()

	this.visible = !this.visible
}

Editor.prototype.hide = function() {
	var height = this.getHeight()
	this.element.style.top = -height + 'px'
}

Editor.prototype.show = function() {
	this.element.style.removeProperty('top')
}

Editor.prototype.getHeight = function() {
	var style = getComputedStyle(this.element)
	return parseInt(style.height, 10)
}

Editor.prototype.lockScroll = function() {
	var scrollElements = this.element.getElementsByClassName('CodeMirror-scroll')
	var wheel = function(event) {
		var scrollTop = this.scrollTop
	  	var scrollHeight = this.scrollHeight
	  	var height = this.offsetHeight

	  	var upward
	  	if (event.type === 'wheel')
	  		upward = event.deltaY < 0
	  	else
	  		upward = -event.wheelDelta < 0

	  	if (upward && scrollTop === 0 || !upward && scrollTop === scrollHeight - height)
	  		event.preventDefault()
	}

	for (var i = 0, len = scrollElements.length; i < len; ++i) {
		var scrollElement = scrollElements[i]
		var type = 'onwheel' in document ? 'wheel' : 'mousewheel'
		scrollElement.addEventListener(type, wheel, false)
	}
}

document.addEventListener('DOMContentLoaded', function() {
	new Editor()
})
