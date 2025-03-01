import React, {useEffect, useMemo, useRef, useState} from 'react';
import {basicSetup} from 'codemirror';
import {EditorView, keymap} from '@codemirror/view';
import {Text, EditorState} from '@codemirror/state';
import {javascript} from '@codemirror/lang-javascript';
import {syntaxHighlighting} from '@codemirror/language';
import {indentWithTab} from '@codemirror/commands';
import {Player} from '@motion-canvas/core';
import {
  EditorTheme,
  SyntaxHighlightStyle,
} from '@site/src/components/Fiddle/themes';
import CodeBlock from '@theme/CodeBlock';
import {useSubscribableValue} from '@site/src/utils/useSubscribable';
import {SkipPrevious} from '@site/src/Icon/SkipPrevious';
import {SkipNext} from '@site/src/Icon/SkipNext';
import {PlayArrow} from '@site/src/Icon/PlayArrow';
import {Pause} from '@site/src/Icon/Pause';
import IconText from '@site/src/Icon/Text';
import IconSplit from '@site/src/Icon/Split';
import IconImage from '@site/src/Icon/Image';
import {autocomplete} from '@site/src/components/Fiddle/autocomplete';
import {
  borrowPlayer,
  disposePlayer,
  tryBorrowPlayer,
} from '@site/src/components/Fiddle/SharedPlayer';
import styles from './styles.module.css';
import {
  transform,
  TransformError,
} from '@site/src/components/Fiddle/transformer';
import {parseFiddle} from '@site/src/components/Fiddle/parseFiddle';
import Dropdown from '@site/src/components/Dropdown';
import clsx from 'clsx';

export interface FiddleProps {
  className?: string;
  children: string;
  mode?: 'code' | 'editor' | 'preview';
  ratio?: string;
}

function highlight(sizePixels = 4) {
  return [
    {
      boxShadow: '0 0 0px 0 #ccc inset',
      easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
    },
    {
      boxShadow: `0 0 0px ${sizePixels}px #ccc inset`,
      easing: 'cubic-bezier(0.32, 0, 0.67, 0)',
    },
    {boxShadow: '0 0 0px 0 #ccc inset'},
  ];
}

export default function Fiddle({
  children,
  className,
  mode: initialMode = 'editor',
  ratio = '4',
}: FiddleProps) {
  const [player, setPlayer] = useState<Player>(null);
  const editorView = useRef<EditorView>(null);
  const editorRef = useRef<HTMLDivElement>();
  const previewRef = useRef<HTMLDivElement>();
  const [mode, setMode] = useState(initialMode);

  const [error, setError] = useState<TransformError>(null);
  const duration = useSubscribableValue(player?.onDurationChanged);
  const frame = useSubscribableValue(player?.onFrameChanged);
  const state = useSubscribableValue(player?.onStateChanged);

  const [doc, setDoc] = useState<Text | null>(null);
  const [lastDoc, setLastDoc] = useState<Text | null>(null);

  const parsedRatio = useMemo(() => {
    if (ratio.includes('/')) {
      const parts = ratio.split('/');
      const calculated = parseFloat(parts[0]) / parseFloat(parts[1]);
      if (!isNaN(calculated)) {
        return calculated;
      }
    }
    const value = parseFloat(ratio);
    return isNaN(value) ? 4 : value;
  }, [ratio]);

  const update = (newDoc: Text, animate = true) => {
    borrowPlayer(setPlayer, previewRef.current, parsedRatio);
    const newError = transform(newDoc.sliceString(0));
    setError(newError);
    if (!newError) {
      setLastDoc(newDoc);
      if (animate && !lastDoc?.eq(newDoc)) {
        previewRef.current.animate(highlight(), {duration: 300});
      }
    }
  };

  const [snippetId, setSnippetId] = useState(0);
  const snippets = useMemo(
    () =>
      parseFiddle(children).map(snippet => ({
        name: snippet.name,
        state: EditorState.create({
          doc: Text.of(snippet.lines),
          extensions: [
            basicSetup,
            keymap.of([
              indentWithTab,
              {
                key: 'Mod-s',
                preventDefault: true,
                run: view => {
                  update(view.state.doc);
                  return true;
                },
              },
            ]),
            EditorView.updateListener.of(update => {
              setDoc(update.state.doc);
              setError(null);
            }),
            autocomplete(),
            javascript({
              jsx: true,
              typescript: true,
            }),
            syntaxHighlighting(SyntaxHighlightStyle),
            EditorTheme,
          ],
        }),
      })),
    [children],
  );

  useEffect(() => {
    editorView.current = new EditorView({
      parent: editorRef.current,
      state: snippets[snippetId].state,
    });
    const borrowed = tryBorrowPlayer(
      setPlayer,
      previewRef.current,
      parsedRatio,
    );
    if (borrowed) {
      update(snippets[snippetId].state.doc, false);
      if (mode !== 'code') {
        borrowed.togglePlayback(true);
      }
    }

    return () => {
      disposePlayer(setPlayer);
      editorView.current.destroy();
    };
  }, []);

  const hasChangedSinceLastUpdate = lastDoc && doc && !doc.eq(lastDoc);
  const hasChanged =
    (doc && !doc.eq(snippets[snippetId].state.doc)) ||
    hasChangedSinceLastUpdate;

  return (
    <div
      className={clsx(styles.root, className, {
        [styles.codeOnly]: mode === 'code',
        [styles.previewOnly]: mode === 'preview',
      })}
    >
      <div className={styles.layoutControl}>
        <button
          className={clsx(styles.icon, mode === 'code' && styles.active)}
          onClick={() => {
            setMode('code');
            player?.togglePlayback(false);
          }}
          title="Source code"
        >
          <IconText />
        </button>
        <button
          className={clsx(styles.icon, mode === 'editor' && styles.active)}
          onClick={() => setMode('editor')}
          title="Editor with preview"
        >
          <IconSplit />
        </button>
        <button
          className={clsx(styles.icon, mode === 'preview' && styles.active)}
          onClick={() => setMode('preview')}
          title="Preview"
        >
          <IconImage />
        </button>
      </div>
      <div
        className={styles.preview}
        style={{aspectRatio: ratio}}
        ref={previewRef}
      >
        {!player && <div>Press play to preview the animation</div>}
      </div>
      {duration > 0 && (
        <div
          className={styles.progress}
          style={{width: player ? `${(frame / duration) * 100}%` : 0}}
        />
      )}
      <div className={styles.controls}>
        <div className={styles.section}>
          {hasChangedSinceLastUpdate && (
            <button
              onClick={() => update(editorView.current.state.doc)}
              className={styles.button}
            >
              <kbd>CTRL</kbd>
              <kbd>S</kbd>
              <small>Update preview</small>
            </button>
          )}
        </div>
        <div className={styles.section}>
          <button
            className={styles.icon}
            onClick={() => player?.requestPreviousFrame()}
          >
            <SkipPrevious />
          </button>
          <button
            className={styles.icon}
            onClick={() => {
              if (!player) {
                const borrowed = borrowPlayer(
                  setPlayer,
                  previewRef.current,
                  parsedRatio,
                );
                update(editorView.current.state.doc);
                borrowed.togglePlayback(true);
              } else {
                if (!lastDoc) {
                  update(editorView.current.state.doc);
                }
                player.togglePlayback();
              }
            }}
          >
            {!player || (state?.paused ?? true) ? <PlayArrow /> : <Pause />}
          </button>
          <button
            className={styles.icon}
            onClick={() => player?.requestNextFrame()}
          >
            <SkipNext />
          </button>
        </div>
        <div className={styles.section}>
          {snippets.length === 0 && hasChanged && (
            <button
              className={styles.button}
              onClick={() => {
                editorView.current.setState(snippets[snippetId].state);
                update(snippets[snippetId].state.doc);
                setDoc(snippets[snippetId].state.doc);
              }}
            >
              <small>Reset example</small>
            </button>
          )}
          {snippets.length > 1 && (
            <Dropdown
              className={styles.picker}
              value={hasChanged ? -1 : snippetId}
              onChange={id => {
                setSnippetId(id);
                editorView.current.setState(snippets[id].state);
                update(snippets[id].state.doc);
              }}
              options={snippets
                .map((snippet, index) => ({
                  value: index,
                  name: snippet.name,
                }))
                .concat(hasChanged ? {value: -1, name: 'Custom'} : [])}
            />
          )}
        </div>
      </div>
      {error && <pre className={styles.error}>{error.message}</pre>}
      <div className={styles.editor} ref={editorRef}>
        <CodeBlock className={styles.source} language="tsx">
          {snippets[0].state.doc.toString() + (mode === 'code' ? '' : '\n')}
        </CodeBlock>
      </div>
    </div>
  );
}
