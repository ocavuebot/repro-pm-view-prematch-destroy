import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    chip: { inline: true, group: 'inline', atom: true, toDOM: () => ['span', 'chip'] },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    image: { toDOM: () => ['span', 0] },
  },
})
const strong = schema.marks.strong.create()
const image = schema.marks.image.create()
const p = (...content) => schema.nodes.paragraph.create(null, content)

function logger(id) {
  const el = document.getElementById(id)
  return (text, isError) => {
    const line = document.createElement('div')
    if (isError) line.className = 'err'
    line.textContent = text
    el.appendChild(line)
  }
}

function describe(desc) {
  const kids = desc.children.map((c) => `${c.constructor.name}(parent=${c.parent ? 'ok' : 'undefined'})`)
  return `${desc.constructor.name}(parent=${desc.parent ? 'ok' : 'undefined'}) children=[${kids.join(', ')}]`
}

function attempt(log, label, fn) {
  try {
    fn()
    log(`${label}: ok`)
  } catch (error) {
    log(`${label}: ${error.constructor.name}: ${error.message}`, true)
    log(String(error.stack).split('\n').slice(1, 4).join('\n'), true)
  }
}

// A: paragraph("plain ", strong("a", chip, "b")); chip.destroy() throws once.
{
  const log = logger('log-a')
  const doc = schema.nodes.doc.create(null, [
    p(schema.text('plain '), schema.text('a', [strong]), schema.nodes.chip.create(null, null, [strong]), schema.text('b', [strong])),
  ])
  let thrown = false
  const view = new EditorView({ mount: document.getElementById('editor-a') }, {
    state: EditorState.create({ doc, plugins: [history()] }),
    nodeViews: {
      chip: () => ({
        dom: document.createElement('span'),
        destroy() {
          if (thrown) return
          thrown = true
          throw new Error('node view destroy failed')
        },
      }),
    },
  })
  const para = () => view.docView.children[0]
  document.getElementById('run-a').onclick = () => {
    attempt(log, 'delete the marked run', () => {
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, p(schema.text('x'))))
    })
    log('paragraph desc: ' + describe(para()))
    attempt(log, 'undo', () => undo(view.state, view.dispatch))
  }
}

// B: nodeViews change forces a redraw; the image mark view constructor throws.
{
  const log = logger('log-b')
  const doc = schema.nodes.doc.create(null, [
    p(schema.text('plain '), schema.text('bold', [strong])),
    p(schema.text('image', [image])),
  ])
  const view = new EditorView({ mount: document.getElementById('editor-b') }, {
    state: EditorState.create({ doc }),
    nodeViews: {},
  })
  document.getElementById('run-b').onclick = () => {
    const before = view.docView
    attempt(log, 'setProps({ nodeViews }) with a throwing mark view', () => {
      view.setProps({ nodeViews: { image: () => { throw new Error('mark view constructor failed') } } })
    })
    log(`view.docView is the destroyed tree: ${view.docView === before}`)
    log('doc desc: ' + describe(view.docView))
    attempt(log, 'view.destroy()', () => view.destroy())
  }
}
