import {
  appendChild,
  getNode,
  isBlock,
  isComment,
  newDirective,
  removeNode,
  updateArgs,
  updateComment,
  updateDirectiveName,
  GLOBALS_MARKER,
  type Directive,
  type NodePath,
} from "./directives";

interface Props {
  dirs: Directive[];
  selectedPath: NodePath | null;
  onChange: (next: Directive[]) => void;
}

// 递归渲染一个块内部的指令列表，支持编辑参数 / 注释 / 增删。
function DirectiveList({
  dirs,
  basePath,
  block,
  onChange,
}: {
  dirs: Directive[];
  basePath: NodePath; // 该 block 节点自身的路径
  block: Directive[]; // 该 block 的子指令
  onChange: (next: Directive[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {block.map((child, i) => {
        const childPath = [...basePath, i];
        if (isComment(child)) {
          return (
            <div key={i} className="flex items-center gap-1">
              <span className="text-slate-400">#</span>
              <input
                className="code flex-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-500"
                value={child.comment ?? ""}
                onChange={(e) =>
                  onChange(updateComment(dirs, childPath, e.target.value))
                }
              />
              <DeleteBtn onClick={() => onChange(removeNode(dirs, childPath))} />
            </div>
          );
        }
        if (isBlock(child)) {
          return (
            <div
              key={i}
              className="rounded-md border border-slate-200 p-2"
            >
              <div className="flex items-center gap-1">
                <input
                  className="w-40 shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs font-medium"
                  value={child.directive}
                  onChange={(e) =>
                    onChange(updateDirectiveName(dirs, childPath, e.target.value))
                  }
                />
                <input
                  className="code flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
                  value={child.args.join(" ")}
                  placeholder="参数"
                  onChange={(e) =>
                    onChange(
                      updateArgs(
                        dirs,
                        childPath,
                        e.target.value.split(/\s+/).filter(Boolean)
                      )
                    )
                  }
                />
                <DeleteBtn onClick={() => onChange(removeNode(dirs, childPath))} />
              </div>
              <div className="mt-1.5 border-l-2 border-slate-100 pl-2">
                <DirectiveList
                  dirs={dirs}
                  basePath={childPath}
                  block={child.block || []}
                  onChange={onChange}
                />
                <AddBtn
                  onClick={() =>
                    onChange(appendChild(dirs, childPath, newDirective()))
                  }
                />
              </div>
            </div>
          );
        }
        // 普通指令
        return (
          <div key={i} className="flex items-center gap-1">
            <input
              className="w-40 shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs font-medium"
              value={child.directive}
              onChange={(e) =>
                onChange(updateDirectiveName(dirs, childPath, e.target.value))
              }
            />
            <input
              className="code flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
              value={child.args.join(" ")}
              placeholder="参数"
              onChange={(e) =>
                onChange(
                  updateArgs(
                    dirs,
                    childPath,
                    e.target.value.split(/\s+/).filter(Boolean)
                  )
                )
              }
            />
            <DeleteBtn onClick={() => onChange(removeNode(dirs, childPath))} />
          </div>
        );
      })}
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded px-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
      title="删除"
    >
      ✕
    </button>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-1.5 text-xs text-brand-600 hover:text-brand-700"
    >
      + 添加指令
    </button>
  );
}

export default function PropertyPanel({ dirs, selectedPath, onChange }: Props) {
  if (!selectedPath) {
    return (
      <div className="p-4 text-sm text-slate-400">
        在画布上选中一个块（server / upstream 等）以编辑其指令。
      </div>
    );
  }

  // 全局指令：渲染所有顶层简单指令（user / worker_processes / pid 等），可编辑增删。
  if (selectedPath.length === 1 && selectedPath[0] === GLOBALS_MARKER) {
    return (
      <div className="p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">全局指令</h3>
        <p className="mb-3 text-xs text-slate-400">
          顶层全局指令（http / events 之外，编辑后保存走 nginx -t 校验）
        </p>
        <div className="space-y-1.5">
          {dirs.map((d, i) => {
            if (isBlock(d) || isComment(d)) return null; // 只列简单指令
            const path = [i];
            return (
              <div key={i} className="flex items-center gap-1">
                <input
                  className="w-40 shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs font-medium"
                  value={d.directive}
                  onChange={(e) =>
                    onChange(updateDirectiveName(dirs, path, e.target.value))
                  }
                />
                <input
                  className="code flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"
                  value={d.args.join(" ")}
                  placeholder="参数"
                  onChange={(e) =>
                    onChange(
                      updateArgs(
                        dirs,
                        path,
                        e.target.value.split(/\s+/).filter(Boolean)
                      )
                    )
                  }
                />
                <button
                  onClick={() => onChange(removeNode(dirs, path))}
                  className="shrink-0 rounded px-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                  title="删除"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => onChange([...dirs, newDirective()])}
          className="mt-3 text-xs text-brand-600 hover:text-brand-700"
        >
          + 添加全局指令
        </button>
      </div>
    );
  }

  const node = getNode(dirs, selectedPath);
  if (!node) {
    return <div className="p-4 text-sm text-slate-400">节点不存在。</div>;
  }
  const title =
    node.args && node.args.length
      ? `${node.directive} ${node.args.join(" ")}`
      : node.directive;

  return (
    <div className="p-4">
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mb-3 text-xs text-slate-400">
        块内指令（含注释，编辑后保存走 nginx -t 校验）
      </p>
      <DirectiveList
        dirs={dirs}
        basePath={selectedPath}
        block={node.block || []}
        onChange={onChange}
      />
      <AddBtn
        onClick={() => onChange(appendChild(dirs, selectedPath, newDirective()))}
      />
    </div>
  );
}
