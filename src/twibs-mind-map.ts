/*
 * Copyright (c) 2018 - 2019 by Michael Brinkmann (https://www.twibs.net)
 */

namespace TwibsMindMaps {
  export class MindMap {
    constructor(container: HTMLElement) {
      this.container = container;
      this.container.tabIndex = 0;

      // Create mind map
      this.mm = document.createElement("div");
      this.mm.className = "tmm";
      this.container.appendChild(this.mm);
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.mm.appendChild(this.svg);

      // Create shadow container
      this.shadow = document.createElement("div");
      this.shadow.className = "tmm shadow";
      this.container.appendChild(this.shadow);

      container.addEventListener("mousedown", (e: MouseEvent) => {
        if (e.button == 0 && !(e.ctrlKey || e.shiftKey || e.altKey || e.metaKey))
          if (e.target == this.mm) this.moveAround(e);
          else this.onIdeaDo(e.target, (idea) => this.moveIdea(e, idea))
      });
      container.addEventListener("wheel", this.turnWheel);
      container.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.target == this.container && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) {
          e.preventDefault();
        }
      });
      container.addEventListener("keyup", (e: KeyboardEvent) => {
        if (!e.altKey && !e.metaKey) {
          if (e.ctrlKey) {
            "z" == e.key && this.undo();
            "Z" == e.key && this.redo();
            " " == e.key && this.mark();
          } else {
            "+" == e.key && this.scaleUp();
            "-" == e.key && this.scaleDown();
            "<" == e.key && this.collapse();
            ">" == e.key && this.expand();
            "l" == e.key && this.layout(true);
            "f" == e.key && this.fitToContainer();
            "Delete" == e.key && this.removeSelected();
            "Enter" == e.key && this.addSibling();
            "Insert" == e.key && this.addChild();
            if (!e.shiftKey && this.isOneSelected()) {
              const current = this.selected()[0];
              if (" " == e.key && this.isEditing) current.edit();
              "ArrowUp" == e.key && current.arrowUp();
              "ArrowDown" == e.key && current.arrowDown();
              "ArrowLeft" == e.key && current.arrowLeft();
              "ArrowRight" == e.key && current.arrowRight();
            }
          }
        }
      });
      container.addEventListener("dblclick", (e) => this.onIdeaDo(e.target, (idea) => idea.edit()));
      container.addEventListener("click", (e: MouseEvent) => {
        if (e.button == 0) {
          if (e.target == this.mm) {
            this.deselectAll();
            this.changed(false)
          } else this.onIdeaDo(e.target, idea => {
            if (e.ctrlKey) {
              idea.selected = !idea.selected;
              this.changed(true);
            } else idea.selectOnly();
          })
        }
      });
      this.updateScale(parseFloat(window.localStorage.getItem('tmm.scale') || "1"));
      this.initResizeObserver();
    }

    /** HTML elements **/
    readonly container: HTMLElement;
    readonly mm: HTMLDivElement;
    readonly shadow: HTMLDivElement;
    readonly svg: SVGSVGElement;

    /** Access to ideas **/
    readonly ideasMap = new Map<number, Idea>();
    readonly ideasByElement = new Map<HTMLDivElement, Idea>();
    readonly ideasByShadow = new Map<HTMLDivElement, Idea>();
    ideas = () => [...this.ideasMap.values()];

    /** Load and Save **/
    load = (json: string) => (this.fromModels(JSON.parse(json) as Model[]));
    fromModels = (models: Model[]) => this.undoable(() => (models.forEach(model => this.add(model))));
    save = () => JSON.stringify(this.toModels());
    toModels = () => this.ideas().map(idea => idea.toModel());

    /** Modify ideas **/
    add = (model: Model) => {
      const ret = new Idea(this);
      ret.update(model);
      this.ideasMap.set(model.id, ret);
      return ret;
    };
    remove = (id: number) => {
      const idea = this.ideasMap.get(id);
      if (idea) idea.remove();
      this.ideasMap.delete(id);
    };
    update = (model: Model) => this.ideasMap.get(model.id)!.update(model);
    createModel = (id: number, parentId: number, title: string = "", key: string = "", pos: Point = new Point(0, 0), selected: boolean = false, marked: boolean = false, collapsed: boolean = false): Model => ({
      id: id,
      parentId: parentId,
      title: title,
      key: key,
      x: pos.x,
      y: pos.y,
      selected: selected,
      marked: marked,
      collapsed: collapsed
    });

    /** Configuration **/
    public isEditing = true;
    public isMarking = true;

    /* Use as callback */
    // noinspection JSUnusedLocalSymbols
    public onChanged = (mindMap: MindMap): void => {
    };

    /** Undo & Redo */
    private undoActions: UR[][] = [];
    private redoActions: UR[][] = [];
    private ur = (undo: () => void, redo: () => void): UR => ({undo: undo, redo: redo});
    private AddUR = (m: Model) => this.ur(() => this.remove(m.id), () => this.add(m));
    private RemoveUR = (m: Model) => this.ur(() => this.add(m), () => this.remove(m.id));
    private UpdateUR = (from: Model, to: Model) => this.ur(() => this.update(from), () => this.update(to));
    undoable = (f: () => void) => {
      const snapshot = this.toModels();
      f();
      this.redraw(true);
      this.storeUndoRedo(snapshot);
      this.updateButtons();
      this.onChanged(this);
    };

    storeUndoRedo = (snapshot: Model[]) => {
      const changed: UR[] = [];
      const p = snapshot.sort((a, b) => a.id - b.id);
      const u = this.ideas().map(i => i.toModel()).sort((a, b) => a.id - b.id);
      while (p.length > 0 || u.length > 0) {
        if (p.length == 0) {
          changed.push(...u.map(m => this.AddUR(m)));
          u.length = 0;
        } else if (u.length == 0) {
          changed.push(...p.map(m => this.RemoveUR(m)));
          p.length = 0;
        } else if (p[0].id < u[0].id) {
          changed.push(this.RemoveUR(p.shift()!));
        } else if (p[0].id > u[0].id) {
          changed.push(this.AddUR(p.shift()!));
        } else {
          changed.push(this.UpdateUR(p.shift()!, u.shift()!));
        }
      }
      if (changed.length > 0) {
        this.undoActions.push(changed);
        this.redoActions.length = 0;
      }
    };

    // noinspection JSUnusedGlobalSymbols
    clearUndoRedo = () => {
      this.undoActions.length = 0;
      this.redoActions.length = 0;
      this.updateButtons();
    };
    canUndo = () => this.undoActions.length > 0;
    undo = () => {
      if (this.canUndo()) {
        this.blur();
        const urs = this.undoActions.pop()!;
        this.redoActions.push(urs);
        urs.forEach(ur => ur.undo());
        this.changed(true);
      }
    };
    canRedo = () => this.redoActions.length > 0;
    redo = () => {
      if (this.canRedo()) {
        this.blur();
        const urs = this.redoActions.pop()!;
        this.undoActions.push(urs);
        urs.forEach(ur => ur.redo());
        this.changed(true);
      }
    };

    /** Toolbar **/
    buttons: Button[] = [];
    private updateButtons = () => this.buttons.forEach(e => e.update());
    public attachButtons = (toolbar: Element | null): void => {
      if (toolbar == null) return;
      const me = this;

      function addButton(selector: string, enabled: () => boolean, action: () => void): void {
        toolbar!.querySelectorAll(`button[data-tmm=${selector}]`).forEach(e => {
          if (e instanceof HTMLButtonElement) {
            e.addEventListener("click", action);
            e.addEventListener("mousedown", (e: MouseEvent) => e.preventDefault());
            const button: Button = {
              update: () => e.disabled = !enabled()
            };
            me.buttons.push(button);
            button.update()
          }
        })
      }

      addButton("undo", this.canUndo, this.undo);
      addButton("redo", this.canRedo, this.redo);
      addButton("expand", this.canExpand, this.expand);
      addButton("collapse", this.canCollapse, this.collapse);
      addButton("scale-up", this.canScaleUp, this.scaleUp);
      addButton("scale-down", this.canScaleDown, this.scaleDown);
      addButton("add-sibling", this.canAddSibling, this.addSibling);
      addButton("add-child", this.canAddChild, this.addChild);
      addButton("remove", this.canRemove, this.removeSelected);
      addButton("mark", this.canMark, this.mark);
      addButton("fit-to-container", this.canFitToContainer, this.fitToContainer);
      addButton("layout", this.canLayout, () => this.layout(true));
      this.updateButtons();
    };

    /** Scaling and scrolling **/
    scale = 1;
    updateScale = (newScale: number): void => {
      this.scale = Math.round(Math.max(0.1, newScale) * 100) / 100.0;
      this.mm.style.transform = `scale(${this.scale})`;
      this.redraw(false);
      window.localStorage.setItem("tmm.scale", "" + this.scale);
    };
    displaySize = () => new Point(this.container.offsetWidth, this.container.offsetHeight).divide(this.scale);

    public canScaleUp = () => true;
    public scaleUp = () => this.updateScale(this.scale * 1.5);

    public canScaleDown = () => true;
    public scaleDown = () => this.updateScale(this.scale / 1.5);

    public canFitToContainer = () => this.ideas().length > 0;
    public fitToContainer = () => {
      if (this.canFitToContainer()) {
        const rect = this.ideas().length > 1 ? this.ideas().reduce((rect, idea) => idea.rect().union(rect), this.ideas()[0].rect()) : this.ideas()[0].rect();
        this.moveRootIdeas(new Point(-rect.center.x, -rect.center.y));
        const newSize = new Point(rect.width + 80, rect.height + 80);
        this.updateScale(Math.min(this.container.offsetWidth / newSize.x, this.container.offsetHeight / newSize.y));
      }
    };

    private initResizeObserver = () => {
      let containerWidth = this.container.offsetWidth,
          containerHeight = this.container.offsetHeight;
      const me = this;

      function observe() {
        if (me.container.offsetWidth != containerWidth || me.container.offsetHeight != containerHeight) {
          containerWidth = me.container.offsetWidth;
          containerHeight = me.container.offsetHeight;
          me.redraw(false);
        }
      }

      window.setInterval(observe, 20);
      window.addEventListener("resize", observe);
    };

    /** Mark, collapse, expand **/
    canCollapse = () => this.selected().some(e => e.canCollapse());
    collapse = () => {
      if (this.canCollapse()) this.undoable(() => {
        this.selected().filter(idea => idea.canCollapse()).forEach(idea => idea.collapsed = true);
      });
    };

    canExpand = () => this.selected().some(e => e.canExpand());
    expand = () => {
      if (this.canExpand()) this.undoable(() => {
        this.selected().filter(idea => idea.canExpand()).forEach(idea => idea.collapsed = false);
      });
    };

    canMark = () => this.isMarking && this.hasSelected();
    mark = () => {
      if (this.canMark()) this.undoable(() => {
        this.selected().forEach(s => s.marked = !s.marked)
      });
    };

    /** Convert positions **/
    displayCenter = () => this.displaySize().divide(2);
    toDisplayPos = (pos: Point) => pos.plus(this.displayCenter());
    mouseToModelPos = (e: MouseEvent) => {
      const rect = this.mm.getBoundingClientRect();
      return new Point(e.clientX - rect.left, e.clientY - rect.top).divide(this.scale).minus(this.displayCenter());
    };

    /** Drawing **/
    changed = (animation: boolean) => {
      this.redraw(animation);
      this.updateButtons();
      this.onChanged(this);
    };

    redraw = (animation: boolean) => {
      this.displaySize().toSize(this.mm);
      if (!animation) this.mm.classList.add("no-animation");
      this.ideas().forEach(idea => idea.updateShadow());
      this.ideas().filter(idea => idea.dirty).forEach(idea => idea.computeSizes());
      this.layoutAll(false);
      this.ideas().forEach(idea => idea.drawElement());
      if (!animation) window.setTimeout(() => this.mm.classList.remove("no-animation"), 0);
    };

    /** Select **/
    selected = () => this.ideas().filter(e => e.selected && !e.isHidden());
    hasSelected = () => this.selected().length > 0;
    isOneSelected = () => this.selected().length == 1;
    deselectAll = () => this.selected().forEach(idea => idea.selected = false);

    /** Layout **/
    canLayout = () => this.ideas().length > 0;
    layout = (force: boolean) => {
      if (this.canLayout) this.undoable(() => !this.hasSelected() ? this.layoutAll(force) : this.selected().forEach(idea => idea.layout(force)));
    };
    private layoutAll = (force: boolean) => this.ideas().filter(idea => idea.level() == 1).forEach(idea => idea.layout(force));

    /** Modifying **/
    moveRootIdeas = (distance: Point) => this.ideas().filter(idea => idea.level() == 1).forEach(idea => idea.move(distance));

    canRemove = () => this.isEditing && this.hasSelected();
    removeSelected = () => {
      if (this.canRemove()) this.undoable(() => {
        const idea = this.isOneSelected() ? this.selected()[0].parent() : undefined;
        this.selected().forEach(idea => idea.thisAndDescendants().map(i => this.remove(i.id)));
        if (idea) {
          idea.selected = true;
          idea.scrollIntoView();
        }
      });
    };

    canAddSibling = () => this.isEditing && this.isOneSelected() && this.selected()[0].level() > 1;
    addSibling = () => {
      if (this.canAddSibling) {
        this.undoable(() => {
          this.blur();
          const c = this.selected()[0];
          this.deselectAll();
          const child = this.add(this.createModel(this.nextId(), c.parentId, "", "", new Point(c.pos.x, c.pos.y + 1), true));
          child.updateShadow();
          child.computeSizes();
          child.drawElement();
          window.setTimeout(child.edit, 0);
        })
      }
    };

    canAddChild = () => this.isEditing && (this.isOneSelected() || this.ideas().length == 0);
    addChild = () => {
      if (this.canAddChild) {
        this.undoable(() => {
          this.blur();
          if (this.hasSelected()) {
            const c = this.selected()[0];
            c.collapsed = false;
            this.deselectAll();
            const child = this.add(this.createModel(this.nextId(), c.id, "", "", new Point(0, 0), true));
            child.updateShadow();
            child.computeSizes();
            child.drawElement();
            window.setTimeout(child.edit, 0);
          } else {
            const child = this.add(this.createModel(this.nextId(), 0, "", "", new Point(0, 0), true));
            window.setTimeout(child.edit, 0);
          }
        })
      }
    };
    blur = () => {
      const e = document.activeElement;
      if (e instanceof HTMLSpanElement && e.parentElement instanceof HTMLDivElement && this.ideasByElement.get(e.parentElement)) e.blur();
    };

    nextId = () => Math.max(...this.ideas().map(idea => idea.id)) + 1;

    /** Events **/
    private onIdeaDo = (node: EventTarget | null, f: (idea: Idea) => void) => {
      const idea = this.findIdeaByNode(node);
      if (idea) f(idea);
    };

    private findIdeaByNode = (node: any): Idea | undefined => {
      if (node instanceof HTMLDivElement && node.parentElement == this.mm) return this.ideasByElement.get(node);
      if (node != this.mm && node instanceof HTMLElement) return this.findIdeaByNode(node.parentElement);
      return undefined;
    };

    private turnWheel = (e: WheelEvent) => {
      if (!this.forceCtrlForWheel || e.ctrlKey) {
        e.preventDefault();
        const newScale = this.scale * (1 + (e.deltaY > 0 ? -0.1 : 0.1));
        const centerOffset = this.mouseToModelPos(e);
        const distance = centerOffset.divide(newScale / this.scale).minus(centerOffset);
        this.moveRootIdeas(distance);
        this.updateScale(newScale)
      }
    };
    forceCtrlForWheel = true;

    private moveAround = (e: MouseEvent): void => {
      const dh = new DragHandler(this.mm, e);
      dh.drag = (pos: Point) => {
        this.moveRootIdeas(pos.minus(dh.lastPos).divide(this.scale));
        this.redraw(false)
      };
      dh.stopDrag = () => this.changed(false)
      dh.start();
    };

    private moveIdea = (e: MouseEvent, idea: Idea) => {
      const image = idea.element.cloneNode(true) as HTMLElement;
      image.classList.add("drag-image");
      const dh = new DragHandler(this.mm, e);
      dh.startDrag = () => {
        idea.element.classList.add("dragging");
        this.mm.appendChild(image);
      };
      dh.stopDrag = () => {
        this.mm.removeChild(image);
        idea.element.classList.remove("dragging");
      };
      dh.drag = (pos: Point) => idea.elementPos().plus(pos.minus(dh.startPos).divide(this.scale)).toPosition(image);
      dh.drop = (e: MouseEvent) => {
        this.undoable(() => {
          const wasLeft = idea.isLeft();
          const target = this.findIdeaByNode(e.target);
          if (target) {
            const relative = this.mouseToModelPos(e);
            if (target.level() == 1 && wasLeft != (target.absPos().x > relative.x)
                || target.level() != 1 && target.isLeft() != wasLeft) swap(idea.thisAndDescendants());
            const taa = target.thisAndAncestors();
            const idx = taa.indexOf(idea);
            if (idx > 0) {
              const follower = taa[idx - 1];
              follower.parentId = idea.parentId;
            }
            idea.parentId = target.id;
          } else {
            idea.move((new Point(e.clientX, e.clientY).minus(dh.startPos).divide(this.scale)));
            if (idea.isLeft() != wasLeft) swap(idea.descendants());
          }

          function swap(ideas: Idea[]) {
            ideas.forEach(idea => idea.pos = new Point(-idea.pos.x, idea.pos.y));
          }
        })
      };
      dh.start();
    };

    toSvgPath = (level: number, from: Point, to: Point) => this.toCurvedSvgPath(from, to);
    toCurvedSvgPath = (from: Point, to: Point) => {
      const ox = from.x + (to.x - from.x) / 1.5;
      const oy = from.y;
      const ix = to.x - (to.x - from.x) / 2;
      const iy = to.y;
      return `M ${from.x} ${from.y} C ${ox} ${oy} ${ix} ${iy} ${to.x} ${to.y}`
    };
  }

  export class Idea {
    private mindMap: MindMap;
    id: number = 0;
    parentId: number = 0;
    title: string = "";
    key: string = "";
    pos: Point = new Point(0, 0);
    selected: boolean = false;
    marked: boolean = false;
    collapsed: boolean = false;

    // elements
    readonly element: HTMLDivElement;
    private readonly titleElement: HTMLSpanElement;
    readonly shadow: HTMLDivElement;
    private readonly titleShadow: HTMLSpanElement;
    private readonly connectionElements: HTMLElement[];

    // computed by shadow
    dirty = true;
    width: number = 0;
    height: number = 0;
    marginLeft: number = 0;
    marginRight: number = 0;
    marginTop: number = 0;
    marginBottom: number = 0;
    connectionOffsets: Point[] = [];

    constructor(mindMap: MindMap) {
      this.mindMap = mindMap;

      // create element
      this.element = document.createElement("div");
      this.titleElement = document.createElement("span");
      this.element.appendChild(this.titleElement);
      this.mindMap.mm.appendChild(this.element);
      this.mindMap.ideasByElement.set(this.element, this);

      // create shadow
      this.shadow = document.createElement("div");
      this.titleShadow = document.createElement("span");
      this.shadow.appendChild(this.titleShadow);
      this.connectionElements = [1, 2].map(i => {
        const a = document.createElement("i");
        a.classList.add(`p${i}`);
        this.shadow.appendChild(a);
        return a;
      });
      this.mindMap.shadow.appendChild(this.shadow);
      this.mindMap.ideasByShadow.set(this.shadow, this);

      // Edit events
      this.titleElement.addEventListener("keydown", (e: KeyboardEvent) => e.key == "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.preventDefault());
      this.titleElement.addEventListener("keyup", (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key == "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          this.mindMap.container.focus();
        } else if (e.key == "Escape" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();

          this.titleElement.innerHTML = this.title;
          this.mindMap.container.focus();
          // this.mindMap.changed(true); is called by focusout event handler
        }
      });
      this.titleElement.addEventListener("input", () => {
        this.titleShadow.innerHTML = this.titleElement.innerHTML;
        this.dirty = true;
        this.mindMap.redraw(false);
      });
      this.titleElement.addEventListener("focusin", () => {
        this.mindMap.mm.scrollTop = 0;
        this.mindMap.mm.scrollLeft = 0;
        window.setTimeout(() => this.mindMap.mm.classList.add("title-focused"), 500);
      });
      this.titleElement.addEventListener("focusout", () => {
        this.mindMap.mm.classList.remove("title-focused");
        this.titleElement.contentEditable = "false";
        if (this.title != this.titleElement.innerHTML) {
          this.title = this.titleElement.innerHTML;
          this.mindMap.storeUndoRedo(this.snapshot);
          this.mindMap.changed(true);
        } else {
          this.snapshot.forEach(m => this.mindMap.ideasMap.get(m.id)!.update(m));
          this.mindMap.changed(true);
        }
      });
    }

    parent = (): Idea | undefined => this.id == this.parentId ? undefined : this.mindMap.ideasMap.get(this.parentId);
    level = (): number => this.parent() ? this.parent()!.level() + 1 : 1;
    isHidden = (): boolean => this.parent() ? this.parent()!.isHidden() || this.parent()!.isCollapsed() : false;
    isCollapsed = (): boolean => this.collapsed;
    isLeft = (): boolean => this.level() == 2 ? this.pos.x < 0 : this.parent() ? this.parent()!.isLeft() : false;
    canCollapse = () => !this.collapsed && this.children().length > 0;
    canExpand = () => this.collapsed && this.children().length > 0;

    /** Access to idea tree **/
    children = (): Idea[] => this.mindMap.ideas().filter(idea => idea.parentId === this.id);
    thisAndAncestors = (): Idea[] => this.level() > 1 ? ([this] as Idea[]).concat(this.parent()!.thisAndAncestors()) : [this];
    thisAndDescendants = (): Idea[] => {
      const ret: Idea[] = [this];
      this.children().forEach(c => ret.push(...c.thisAndDescendants()));
      return ret;
    };
    descendants = () => {
      const ret = this.thisAndDescendants();
      ret.shift();
      return ret;
    };

    /** Positions **/
    absPos = (): Point => this.parent() ? this.parent()!.absPos().plus(this.isHidden() ? new Point(0, 0) : this.pos) : this.pos;
    elementPos = (): Point => this.mindMap.toDisplayPos(this.rect().leftTop().minus(new Point(this.marginLeft, this.marginTop)));
    rect = () => this.absPos().minus(new Point(this.width / 2, this.height / 2)).toRect(this.width, this.height);
    connectionPoints = () => this.connectionOffsets.map(co => this.absPos().plus(co));

    /** Modify, load, save **/
    update = (model: Model) => {
      this.id = model.id;
      this.parentId = model.parentId;
      this.title = model.title;
      this.key = model.key;
      this.pos = new Point(model.x, model.y);
      this.selected = model.selected;
      this.marked = model.marked;
      this.collapsed = model.collapsed;
    };
    toModel = (): Model => ({
      id: this.id,
      parentId: this.parentId,
      title: this.title,
      key: this.key,
      x: this.pos.x,
      y: this.pos.y,
      selected: this.selected,
      marked: this.marked,
      collapsed: this.collapsed
    });

    remove = () => {
      this.mindMap.ideasByShadow.delete(this.shadow);
      this.mindMap.ideasByElement.delete(this.element);
      this.mindMap.mm.removeChild(this.element);
      this.mindMap.shadow.removeChild(this.shadow);
      if (this.pathOption) this.mindMap.svg.removeChild(this.pathOption);
    };

    /** Rendering **/
    updateShadow = () => {
      if (!this.shadow.classList.contains(`l${this.level()}`)) {
        this.dirty = true;
        this.shadow.className = `l${this.level()}`;
      }
      if (!this.titleElement.isContentEditable && this.titleShadow.innerHTML != this.title) {
        this.dirty = true;
        this.titleShadow.innerHTML = this.title;
      }
      this.toggleClasses(this.shadow);
    };

    computeSizes = () => {
      this.dirty = false;
      const style = window.getComputedStyle(this.shadow);
      this.marginLeft = parseInt(style.marginLeft || "0", 10);
      this.marginTop = parseInt(style.marginTop || "0", 10);
      this.marginBottom = parseInt(style.marginBottom || "0", 10);
      this.marginRight = parseInt(style.marginRight || "0", 10);
      this.width = parseInt(style.width || "0", 10);
      this.height = parseInt(style.height || "0", 10);
      this.connectionOffsets = this.connectionElements.map(ce => {
        const ceStyle = window.getComputedStyle(ce);
        return new Point(this.toInt(ceStyle.left, ce.offsetLeft) + this.toInt(ceStyle.width, ce.offsetWidth) / 2 - this.width / 2, this.toInt(ceStyle.top,ce.offsetTop) + this.toInt(ceStyle.height, ce.offsetHeight) / 2 - this.height / 2)
      });
    };
    // use fallback if style attributes left, top, width or height are not included in getComputedStyle (Edge)
    private toInt = (px: string, fallback: number) => parseInt(px || "", 10) || fallback;

    layout = (force: boolean) => {
      if (this.level() == 1) {
        this.doLayout(force, this.children().filter(i => i.isLeft()), true);
        this.doLayout(force, this.children().filter(i => !i.isLeft()), false);
        return this.rect();
      } else
        return this.doLayout(force, this.children(), this.isLeft());
    };

    // Ugly but quick!
    private doLayout = (force: boolean, what: Idea[], left: boolean) => {
      function moveLayout(layout: Layout, offset: number) {
        layout.idea.move(new Point(0, offset));
        layout.rect = layout.rect.plus(new Point(0, offset));
        return layout.rect;
      }

      let ret = left
          ? new Rectangle(this.rect().left, this.rect().top - this.marginTop, this.rect().width + this.marginRight, this.rect().height + this.marginTop)
          : new Rectangle(this.rect().left - this.marginLeft, this.rect().top - this.marginTop, this.rect().width + this.marginLeft, this.rect().height + this.marginTop);
      if (!this.isCollapsed() && what.length > 0) {
        const layouts: Layout[] = what.map(child => {
          const cr = child.layout(force);
          const shift = left
              ? force || this.rect().left < cr.right ? new Point(this.rect().left - cr.right, 0) : new Point(0, 0)
              : force || this.rect().right > cr.left ? new Point(this.rect().right - cr.left, 0) : new Point(0, 0);
          child.move(shift);
          return {idea: child, rect: cr.plus(shift)}
        }).sort((a, b) => a.idea.pos.y - b.idea.pos.y);
        const requiredSpace = layouts.map(i => i.rect.height).reduce((a, b) => a + b, 0);

        if (force) {
          let y = this.absPos().y - (requiredSpace - layouts[0].idea.marginTop) / 2;
          layouts.forEach(layout => {
            ret = ret.union(moveLayout(layout, y - layout.rect.top - layout.idea.marginTop));
            y = y + layout.rect.height;
          });
        } else {
          recurse(layouts, layouts[0].rect.top, layouts[layouts.length - 1].rect.bottom, requiredSpace);
        }
      }
      return ret;

      function recurse(layouts: Layout[], upperBound: number, lowerBound: number, requiredSpace: number): void {
        if (layouts.length == 1) {
          const one = layouts[0];
          if (one.rect.top < upperBound) moveLayout(one, upperBound - one.rect.top);
          else if (one.rect.bottom > lowerBound) moveLayout(one, -(one.rect.bottom - lowerBound));
          ret = ret.union(one.rect);
        } else if (layouts.length > 1) {
          const first = layouts.shift()!;
          const last = layouts.pop()!;
          const top = (first.rect.top < upperBound) ? upperBound : first.rect.top;
          if (first.rect.top < upperBound) moveLayout(first, upperBound - first.rect.top);
          const bottom = (last.rect.bottom > lowerBound) ? lowerBound : last.rect.bottom;
          if (last.rect.bottom > lowerBound) moveLayout(last, -(last.rect.bottom - lowerBound));
          const availableSpace = bottom - top;
          if (requiredSpace > availableSpace) {
            const upperSpace = top - upperBound;
            const lowerSpace = lowerBound - bottom;
            let firstOffset = -(requiredSpace - availableSpace);
            let lastOffset = (requiredSpace - availableSpace);
            if (upperSpace == 0 && lowerSpace == 0) {
              firstOffset /= 2;
              lastOffset /= 2;
            } else {
              firstOffset *= upperSpace / (upperSpace + lowerSpace);
              lastOffset *= lowerSpace / (upperSpace + lowerSpace);
            }
            moveLayout(first, firstOffset);
            moveLayout(last, lastOffset);
            ret = ret.union(first.rect).union(last.rect);
            recurse(layouts, top + first.rect.height + firstOffset, bottom - last.rect.height + lastOffset, requiredSpace - first.rect.height - last.rect.height)
          } else {
            ret = ret.union(first.rect).union(last.rect);
            recurse(layouts, top + first.rect.height, bottom - last.rect.height, requiredSpace - first.rect.height - last.rect.height);
          }
        }
      }
    };

    toggleClasses = (e: HTMLElement) => {
      e.classList.toggle("marked", this.marked);
      e.classList.toggle("selected", this.selected);
      e.classList.toggle("collapsed", this.collapsed);
    };

    drawElement = () => {
      this.elementPos().toPosition(this.element);
      new Point(this.width, this.height).toSize(this.element);

      if (!this.element.classList.contains(`l${this.level()}`)) this.element.className = `l${this.level()}`;
      this.element.classList.toggle("hidden", this.isHidden());
      this.toggleClasses(this.element);
      if (!this.titleElement.isContentEditable && this.titleElement.innerHTML != this.title) this.titleElement.innerHTML = this.title;

      if (this.level() > 1) {
        const parentConnectionPoints = this.parent()!.connectionPoints();
        const myConnectionPoints = this.connectionPoints();
        let pcp = parentConnectionPoints[0];
        let mcp = myConnectionPoints[0];
        let best = pcp.distance(mcp);
        for (const p of parentConnectionPoints) {
          for (const m of myConnectionPoints) {
            const dist = p.distance(m);
            if (dist < best) {
              best = dist;
              pcp = p;
              mcp = m;
            }
          }
        }
        this.path().setAttributeNS(null, "d", this.mindMap.toSvgPath(this.level(), this.mindMap.toDisplayPos(mcp), this.mindMap.toDisplayPos(pcp)));
        this.path().classList.toggle("hidden", this.isHidden());
      } else if (this.pathOption) {
        this.mindMap.svg.removeChild(this.pathOption);
        this.pathOption = undefined;
      }
    };
    path = (): SVGPathElement => this.pathOption || this.initPath();
    private pathOption: SVGPathElement | undefined = undefined;
    private initPath = () => {
      const ret = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
      this.mindMap.svg.appendChild(ret);
      this.pathOption = ret;
      return ret;
    };
    move = (distance: Point) => this.pos = this.pos.plus(distance);

    snapshot: Model[] = [];
    edit = () => {
      if (this.mindMap.isEditing && this.titleElement.contentEditable != "true") {
        this.titleElement.contentEditable = "true";
        this.scrollIntoView();
        this.snapshot = this.mindMap.toModels();
        this.mindMap.redraw(true);
        this.titleElement.focus();
      }
    };
    scrollIntoView = () => {
      const dr = this.rect();
      const displayCenter = this.mindMap.displayCenter();
      let offsetX = 0;
      let offsetY = 0;
      if (dr.right + this.marginRight > displayCenter.x) offsetX = displayCenter.x - (dr.right + this.marginRight);
      if (dr.left - this.marginLeft < -displayCenter.x) offsetX = -displayCenter.x - (dr.left - this.marginLeft);
      if (dr.bottom + this.marginBottom > displayCenter.y) offsetY = displayCenter.y - (dr.bottom + this.marginBottom);
      if (dr.top - this.marginTop < -displayCenter.y) offsetY = -displayCenter.y - (dr.top - this.marginTop);
      if (offsetX != 0 || offsetY != 0) {
        this.mindMap.moveRootIdeas(new Point(offsetX, offsetY));
        return true;
      }
      return false;
    };

    /** Move selection using arrows **/
    arrowUp = () => this.previousSibling() ? this.previousSibling()!.selectOnly() : this.arrow((i, c) => i.y < c.y);
    arrowDown = () => this.nextSibling() ? this.nextSibling()!.selectOnly() : this.arrow((i, c) => i.y > c.y);
    private previousSibling = () => this.siblings().filter(idea => idea.isLeft() == this.isLeft() && idea.pos.y < this.pos.y).reverse()[0];
    private nextSibling = () => this.siblings().filter(idea => idea.isLeft() == this.isLeft() && idea.pos.y > this.pos.y)[0];
    private siblings = () => this.parent() ? this.parent()!.children().filter(idea => idea != this).sort((a, b) => a.pos.y - b.pos.y) : [];

    arrowLeft = () => this.level() != 1 && !this.isLeft() ? this.parent()!.selectOnly() : this.childOrNearest(this.leftChildren(), (i, c) => i.x < c.x);
    arrowRight = () => this.level() != 1 && this.isLeft() ? this.parent()!.selectOnly() : this.childOrNearest(this.rightChildren(), (i, c) => i.x > c.x);
    leftChildren = () => this.children().filter(idea => !idea.isHidden()).filter(idea => idea.absPos().x < this.absPos().x);
    rightChildren = () => this.children().filter(idea => !idea.isHidden()).filter(idea => idea.absPos().x > this.absPos().x);
    childOrNearest = (vc: Idea[], filter: (ideaPos: Point, currentPos: Point) => boolean) => (vc.length > 0 ? this.findNearest(vc)!.selectOnly() : this.arrow(filter));

    private arrow = (filter: (ideaPos: Point, currentPos: Point) => boolean) => {
      const to = this.findNearest(this.mindMap.ideas().filter(idea => !idea.isHidden()).filter(idea => filter(idea.absPos(), this.absPos())));
      if (to) to.selectOnly();
    };
    private findNearest = (ideas: Idea[]): Idea | undefined => {
      const s = ideas.map(idea => ({
        idea: idea,
        distance: this.absPos().distance(idea.absPos())
      })).sort((a, b) => a.distance - b.distance)[0];
      return s ? s.idea : undefined;
    };

    selectOnly = () => {
      this.mindMap.deselectAll();
      this.selected = true;
      this.scrollIntoView();
      this.mindMap.changed(true);
    };
  }

  const mindMaps = new Map<HTMLElement, MindMap>();

  export function init(el: HTMLElement | null): MindMap {
    if (el == null) throw "Element must not be null";
    const existing = mindMaps.get(el);
    if (existing) return existing;
    const ret = new MindMap(el);
    mindMaps.set(el, ret);
    return ret;
  }

  type UR = {
    undo(): void;

    redo(): void;
  }

  type Button = {
    update(): any
  }

  type Model = {
    id: number;
    parentId: number;
    title: string;
    key: string;
    x: number;
    y: number;
    selected: boolean;
    marked: boolean;
    collapsed: boolean
  }

  type Layout = {
    idea: Idea;
    rect: Rectangle;
  }

  class DragHandler {
    constructor(container: HTMLElement, startEvent: MouseEvent) {
      this.container = container;
      this.startEvent = startEvent;
      this.startPos = new Point(this.startEvent.clientX, this.startEvent.clientY);
      this.lastPos = this.startPos;
    }

    private container: HTMLElement;
    private startEvent: MouseEvent;
    private dragging = false;
    readonly minDistance = 4;
    readonly startPos: Point;
    lastPos: Point;

    private keyUp = (e: KeyboardEvent) => {
      if (e.key == "Escape") this.stop();
    };
    private mouseUp = (e: MouseEvent) => {
      this.stop();
      if (this.dragging) this.drop(e);
    };
    private click = (e: MouseEvent) => {
      if (this.dragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    private mouseMove = (e: MouseEvent) => {
      const pos = new Point(e.clientX, e.clientY);
      const diff = pos.minus(this.startPos);
      if (!this.dragging && diff.length() > this.minDistance) {
        this.dragging = true;
        this.container.classList.add("dragging");
        this.startDrag();
      }
      if (this.dragging) {
        this.drag(pos);
        this.lastPos = pos;
      }
    };

    start = () => {
      document.addEventListener("click", this.click, true);
      this.container.addEventListener("mouseup", this.mouseUp);
      this.container.addEventListener("mousemove", this.mouseMove);
      document.addEventListener("mouseup", this.stop);
      document.addEventListener("keyup", this.keyUp)
    };

    stop = () => {
      if (this.dragging) {
        this.stopDrag();
        this.container.classList.remove("dragging");
      }
      window.setTimeout(() => document.removeEventListener("click", this.click, true), 0);
      this.container.removeEventListener("mousemove", this.mouseMove);
      this.container.removeEventListener("mouseup", this.mouseUp);
      document.removeEventListener("mouseup", this.stop);
      document.removeEventListener("keyup", this.keyUp)
    };
    startDrag = (): void => {
    };
    // noinspection JSUnusedLocalSymbols
    drag = (pos: Point): void => {
    };
    // noinspection JSUnusedLocalSymbols
    drop = (e: MouseEvent): void => {
    };
    stopDrag = (): void => {
    };
  }

  class Point {
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }

    readonly x: number;
    readonly y: number;

    distance = (other: Point) => Math.sqrt(Math.pow(this.x - other.x, 2) + Math.pow(this.y - other.y, 2));
    length = () => this.distance(new Point(0, 0));
    // invert = () => new Point(-this.x, -this.y);
    minus = (point: Point) => new Point(this.x - point.x, this.y - point.y);
    divide = (scale: number) => new Point(this.x / scale, this.y / scale);
    // multiply = (scale: number) => new Point(this.x * scale, this.y * scale);
    plus = (point: Point) => new Point(this.x + point.x, this.y + point.y);
    toPosition = (element: HTMLElement) => {
      // Avoid triggering browser layout
      const left = this.x + "px";
      const top = this.y + "px";
      if (element.style.left != left) element.style.left = left;
      if (element.style.top != top) element.style.top = top;
    };
    toSize = (element: HTMLElement) => {
      // Avoid triggering browser layout
      const width = this.x + "px";
      const height = this.y + "px";
      if (element.style.width != width) element.style.width = width;
      if (element.style.height != height) element.style.height = height;
    };
    toRect = (width: number, height: number) => new Rectangle(this.x, this.y, width, height);
  }

  class Rectangle {
    constructor(left: number, top: number, width: number, height: number) {
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
      this.center = new Point(this.left + this.width / 2, this.top + this.height / 2);
      this.right = this.left + this.width;
      this.bottom = this.top + this.height;
    }

    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly center: Point;
    readonly right: number;
    readonly bottom: number;

    union = (rect: Rectangle) => {
      const nx = Math.min(this.left, rect.left);
      const ny = Math.min(this.top, rect.top);
      return new Rectangle(nx, ny, Math.max(this.right, rect.right) - nx, Math.max(this.bottom, rect.bottom) - ny)
    };
    minus = (point: Point) => new Rectangle(this.left - point.x, this.top - point.y, this.width, this.height);
    plus = (point: Point) => new Rectangle(this.left + point.x, this.top + point.y, this.width, this.height);
    divide = (scale: number) => new Rectangle(this.left / scale, this.top / scale, this.width / scale, this.height / scale);
    leftTop = () => new Point(this.left, this.top);
  }
}
