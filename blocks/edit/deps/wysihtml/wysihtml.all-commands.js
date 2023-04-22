wysihtml.commands.bold = (function() {
  var nodeOptions = {
    nodeName: "B",
    toggle: true
  };
  
  return {
    exec: function(composer, command) {
      wysihtml.commands.formatInline.exec(composer, command, nodeOptions);
    },

    state: function(composer, command) {
      return wysihtml.commands.formatInline.state(composer, command, nodeOptions);
    }
  };
})();

/**
 * Inserts an <img>
 * If selection is already an image link, it removes it
 *
 * @example
 *    // either ...
 *    wysihtml.commands.insertImage.exec(composer, "insertImage", "http://www.google.de/logo.jpg");
 *    // ... or ...
 *    wysihtml.commands.insertImage.exec(composer, "insertImage", { src: "http://www.google.de/logo.jpg", title: "foo" });
 */
wysihtml.commands.insertImage = (function() {
  var NODE_NAME = "IMG";
  return {
    exec: function(composer, command, value) {
      value = typeof(value) === "object" ? value : { src: value };

      var doc     = composer.doc,
          image   = this.state(composer),
          textNode,
          parent;

      // If image is selected and src ie empty, set the caret before it and delete the image
      if (image && !value.src) {
        composer.selection.setBefore(image);
        parent = image.parentNode;
        parent.removeChild(image);

        // and it's parent <a> too if it hasn't got any other relevant child nodes
        wysihtml.dom.removeEmptyTextNodes(parent);
        if (parent.nodeName === "A" && !parent.firstChild) {
          composer.selection.setAfter(parent);
          parent.parentNode.removeChild(parent);
        }

        // firefox and ie sometimes don't remove the image handles, even though the image got removed
        wysihtml.quirks.redraw(composer.element);
        return;
      }

      // If image selected change attributes accordingly
      if (image) {
        for (var key in value) {
          if (value.hasOwnProperty(key)) {
            image.setAttribute(key === "className" ? "class" : key, value[key]);
          }
        }
        return;
      }

      // Otherwise lets create the image
      image = doc.createElement(NODE_NAME);

      for (var i in value) {
        image.setAttribute(i === "className" ? "class" : i, value[i]);
      }

      composer.selection.insertNode(image);
      if (wysihtml.browser.hasProblemsSettingCaretAfterImg()) {
        textNode = doc.createTextNode(wysihtml.INVISIBLE_SPACE);
        composer.selection.insertNode(textNode);
        composer.selection.setAfter(textNode);
      } else {
        composer.selection.setAfter(image);
      }
    },

    state: function(composer) {
      var doc = composer.doc,
          selectedNode,
          text,
          imagesInSelection;

      if (!wysihtml.dom.hasElementWithTagName(doc, NODE_NAME)) {
        return false;
      }

      selectedNode = composer.selection.getSelectedNode();
      if (!selectedNode) {
        return false;
      }

      if (selectedNode.nodeName === NODE_NAME) {
        // This works perfectly in IE
        return selectedNode;
      }

      if (selectedNode.nodeType !== wysihtml.ELEMENT_NODE) {
        return false;
      }

      text = composer.selection.getText();
      text = wysihtml.lang.string(text).trim();
      if (text) {
        return false;
      }

      imagesInSelection = composer.selection.getNodes(wysihtml.ELEMENT_NODE, function(node) {
        return node.nodeName === "IMG";
      });

      if (imagesInSelection.length !== 1) {
        return false;
      }

      return imagesInSelection[0];
    }
  };
})();

wysihtml.commands.insertBlockQuote = (function() {
  var nodeOptions = {
    nodeName: "BLOCKQUOTE",
    toggle: true
  };
  
  return {
    exec: function(composer, command) {
      return wysihtml.commands.formatBlock.exec(composer, "formatBlock", nodeOptions);
    },

    state: function(composer, command) {
      return wysihtml.commands.formatBlock.state(composer, "formatBlock", nodeOptions);
    }
  };
})();

wysihtml.commands.insertHorizontalRule = (function() {
  return {
    exec: function(composer) {
      var node = composer.selection.getSelectedNode(),
          phrasingOnlyParent = wysihtml.dom.getParentElement(node, { query: wysihtml.PERMITTED_PHRASING_CONTENT_ONLY }, null, composer.editableArea),
          elem = document.createElement('hr'),
          range, idx;

      // HR is not allowed into some elements (where only phrasing content is allowed)
      // thus the HR insertion must break out of those https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories
      if (phrasingOnlyParent) {
        composer.selection.splitElementAtCaret(phrasingOnlyParent, elem);
      } else {
        composer.selection.insertNode(elem);
      }

      if (elem.nextSibling) {
        composer.selection.setBefore(elem.nextSibling);
      } else {
        composer.selection.setAfter(elem);
      }
    },
    state: function() {
      return false; // :(
    }
  };
})();

wysihtml.commands.insertOrderedList = (function() {
  return {
    exec: function(composer, command) {
      wysihtml.commands.insertList.exec(composer, command, "OL");
    },

    state: function(composer, command) {
      return wysihtml.commands.insertList.state(composer, command, "OL");
    }
  };
})();

wysihtml.commands.insertUnorderedList = (function() {
  return {
    exec: function(composer, command) {
      wysihtml.commands.insertList.exec(composer, command, "UL");
    },

    state: function(composer, command) {
      return wysihtml.commands.insertList.state(composer, command, "UL");
    }
  };
})();

wysihtml.commands.italic = (function() { 
  var nodeOptions = {
    nodeName: "I",
    toggle: true
  };

  return {
    exec: function(composer, command) {
      wysihtml.commands.formatInline.exec(composer, command, nodeOptions);
    },

    state: function(composer, command) {
      return wysihtml.commands.formatInline.state(composer, command, nodeOptions);
    }
  };
})();

wysihtml.commands.subscript = (function() {
  var nodeOptions = {
    nodeName: "SUB",
    toggle: true
  };

  return {
    exec: function(composer, command) {
      wysihtml.commands.formatInline.exec(composer, command, nodeOptions);
    },

    state: function(composer, command) {
      return wysihtml.commands.formatInline.state(composer, command, nodeOptions);
    }
  };

})();

wysihtml.commands.superscript = (function() {
  var nodeOptions = {
    nodeName: "SUP",
    toggle: true
  };

  return {
    exec: function(composer, command) {
      wysihtml.commands.formatInline.exec(composer, command, nodeOptions);
    },

    state: function(composer, command) {
      return wysihtml.commands.formatInline.state(composer, command, nodeOptions);
    }
  };

})();
