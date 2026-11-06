import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo } from 'prosemirror-history'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    chip: { inline: true, group: 'inline', atom: true, toDOM: () => ['span', { class: 'chip' }, 'chip'] },
    codeBlock: { content: 'text*', group: 'block', code: true, toDOM: () => ['pre', ['code', 0]] },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0] },
    mdImage: { toDOM: () => ['span', { class: 'img' }, 0] },
  },
})
const strong = schema.marks.strong.create()
const mdImage = schema.marks.mdImage.create()
const p = (...content) => schema.nodes.paragraph.create(null, content)

function logger(id) {
  const el = document.getElementById(id)
  return (cls, ...parts) => {
    const line = document.createElement('div')
    line.className = cls
    line.textContent = parts.join(' ')
    el.appendChild(line)
    console[cls === 'err' ? 'error' : 'log'](...parts)
  }
}

function describe(desc) {
  const parent = desc.parent ? desc.parent.constructor.name : String(desc.parent)
  const kids = desc.children.map((c) => `${c.constructor.name}:${c.parent ? 'ok' : String(c.parent)}`).join(', ')
  return `${desc.constructor.name}(parent=${parent}, children=[${kids}])`
}

const uncaught = []
window.addEventListener('error', (event) => {
  uncaught.push(event.error ?? event.message)
  event.preventDefault()
})

// Edit the DOM like a keypress does: ProseMirror's DOMObserver reads it back,
// builds a transaction and calls updateState.
async function typeIntoDOM(log, label, view) {
  uncaught.length = 0
  const textNode = view.dom.querySelector('p').firstChild
  textNode.data = textNode.data + '!'
  await new Promise((resolve) => setTimeout(resolve, 50))
  if (uncaught.length === 0) {
    log('ok', `${label}: ok (doc is now ${JSON.stringify(view.state.doc.textContent)})`)
    return
  }
  for (const error of uncaught) {
    log('err', `${label}: ${error.constructor.name}: ${error.message}`)
    log('err', String(error.stack).split('\n').slice(0, 6).join('\n'))
  }
}

function dirtyOf(desc) {
  return ['NOT_DIRTY', 'CHILD_DIRTY', 'CONTENT_DIRTY', 'NODE_DIRTY'][desc.dirty] ?? desc.dirty
}

function attempt(log, label, fn) {
  try {
    fn()
    log('ok', `${label}: ok`)
    return true
  } catch (error) {
    log('err', `${label}: ${error.constructor.name}: ${error.message}`)
    const where = String(error.stack).split('\n').slice(0, 4).join('\n')
    log('err', where)
    return false
  }
}

// ---------- Scenario A ----------
{
  const log = logger('log-a')
  const doc0 = schema.nodes.doc.create(null, [
    p(schema.text('plain '), schema.text('a', [strong]), schema.nodes.chip.create(null, null, [strong]), schema.text('b', [strong])),
  ])
  let thrown = false
  const view = new EditorView({ mount: document.getElementById('editor-a') }, {
    state: EditorState.create({ doc: doc0, plugins: [history()] }),
    nodeViews: {
      chip: () => {
        const dom = document.createElement('span')
        dom.className = 'chip'
        dom.textContent = 'chip'
        return {
          dom,
          destroy() {
            if (!thrown) {
              thrown = true
              throw new Error('boom from node view destroy (thrown once)')
            }
          },
        }
      },
    },
  })
  const para = () => view.docView.children[0]
  log('ok', 'before:', describe(para()))

  const step1 = () => {
    attempt(log, 'step 1 (delete the marked run)', () => {
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, p(schema.text('x')))
      view.updateState(view.state.apply(tr))
    })
    log('ok', 'after step 1:', describe(para()))
  }
  const step2 = async () => {
    // updateStateInner called domObserver.stop() and never reached start(),
    // so DOM edits are not read back any more. Show that first.
    await typeIntoDOM(log, 'step 2a (edit the DOM like a keypress)', view)
    // Undo restores the same Node objects, so preMatch matches the children
    // of the destroyed mark desc and walks up to its undefined parent.
    attempt(log, 'step 2b (undo)', () => undo(view.state, view.dispatch))
    log('ok', 'after step 2:', describe(para()), 'dirty=' + dirtyOf(para()))
  }
  const destroy = () => attempt(log, 'step 3 (view.destroy(), as at unmount)', () => view.destroy())

  document.getElementById('a-step1').onclick = step1
  document.getElementById('a-step2').onclick = step2
  document.getElementById('a-destroy').onclick = destroy
  document.getElementById('a-run').onclick = async () => { step1(); await step2(); destroy() }
}

// ---------- Scenario B ----------
{
  const log = logger('log-b')
  const doc0 = schema.nodes.doc.create(null, [
    p(schema.text('plain '), schema.text('bold', [strong])),
    p(schema.text('![x](a.png)', [mdImage])),
  ])
  const view = new EditorView({ mount: document.getElementById('editor-b') }, {
    state: EditorState.create({ doc: doc0 }),
    nodeViews: {},
  })
  const show = () => view.docView.children.map(describe).join('\n')
  log('ok', 'before:\n' + show())

  const step1 = () => {
    const before = view.docView
    attempt(log, 'step 1 (setProps with a throwing mark view constructor)', () => {
      view.setProps({
        nodeViews: {
          // Like ProseKit adding its React node view factory one task after mount:
          // nodeViews changed, so updateStateInner takes the redraw branch.
          codeBlock: () => ({ dom: document.createElement('pre') }),
          mdImage: () => {
            throw new Error('boom from mark view constructor (host resolver failed)')
          },
        },
      })
    })
    log(view.docView === before ? 'err' : 'ok', 'view.docView is still the destroyed tree:', String(view.docView === before))
    log('ok', 'after step 1:\n' + show())
  }
  const destroy = () => attempt(log, 'step 2 (view.destroy(), as at unmount)', () => view.destroy())

  document.getElementById('b-step1').onclick = step1
  document.getElementById('b-destroy').onclick = destroy
  document.getElementById('b-run').onclick = () => { step1(); destroy() }
}
