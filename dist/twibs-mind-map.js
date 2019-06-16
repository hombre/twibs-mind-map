"use strict";
var TwibsMindMaps;
(function (TwibsMindMaps) {
    class MindMap {
        constructor(container) {
            this.ideasMap = new Map();
            this.ideasByElement = new Map();
            this.ideasByShadow = new Map();
            this.ideas = () => [...this.ideasMap.values()];
            this.load = (json) => (this.fromModels(JSON.parse(json)));
            this.fromModels = (models) => this.undoable(() => (models.forEach(model => this.add(model))));
            this.save = () => JSON.stringify(this.toModels());
            this.toModels = () => this.ideas().map(idea => idea.toModel());
            this.add = (model) => {
                const ret = new Idea(this);
                ret.update(model);
                this.ideasMap.set(model.id, ret);
                return ret;
            };
            this.remove = (id) => {
                const idea = this.ideasMap.get(id);
                if (idea)
                    idea.remove();
                this.ideasMap.delete(id);
            };
            this.update = (model) => this.ideasMap.get(model.id).update(model);
            this.createModel = (id, parentId, title = "", key = "", pos = new Point(0, 0), selected = false, marked = false, collapsed = false) => ({
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
            this.isEditing = true;
            this.isMarking = true;
            this.onChanged = (mindMap) => {
            };
            this.undoActions = [];
            this.redoActions = [];
            this.ur = (undo, redo) => ({ undo: undo, redo: redo });
            this.AddUR = (m) => this.ur(() => this.remove(m.id), () => this.add(m));
            this.RemoveUR = (m) => this.ur(() => this.add(m), () => this.remove(m.id));
            this.UpdateUR = (from, to) => this.ur(() => this.update(from), () => this.update(to));
            this.undoable = (f) => {
                const snapshot = this.toModels();
                f();
                this.redraw(true);
                this.storeUndoRedo(snapshot);
                this.updateButtons();
                this.onChanged(this);
            };
            this.storeUndoRedo = (snapshot) => {
                const changed = [];
                const p = snapshot.sort((a, b) => a.id - b.id);
                const u = this.ideas().map(i => i.toModel()).sort((a, b) => a.id - b.id);
                while (p.length > 0 || u.length > 0) {
                    if (p.length == 0) {
                        changed.push(...u.map(m => this.AddUR(m)));
                        u.length = 0;
                    }
                    else if (u.length == 0) {
                        changed.push(...p.map(m => this.RemoveUR(m)));
                        p.length = 0;
                    }
                    else if (p[0].id < u[0].id) {
                        changed.push(this.RemoveUR(p.shift()));
                    }
                    else if (p[0].id > u[0].id) {
                        changed.push(this.AddUR(p.shift()));
                    }
                    else {
                        changed.push(this.UpdateUR(p.shift(), u.shift()));
                    }
                }
                if (changed.length > 0) {
                    this.undoActions.push(changed);
                    this.redoActions.length = 0;
                }
            };
            this.clearUndoRedo = () => {
                this.undoActions.length = 0;
                this.redoActions.length = 0;
                this.updateButtons();
            };
            this.canUndo = () => this.undoActions.length > 0;
            this.undo = () => {
                if (this.canUndo()) {
                    this.blur();
                    const urs = this.undoActions.pop();
                    this.redoActions.push(urs);
                    urs.forEach(ur => ur.undo());
                    this.changed(true);
                }
            };
            this.canRedo = () => this.redoActions.length > 0;
            this.redo = () => {
                if (this.canRedo()) {
                    this.blur();
                    const urs = this.redoActions.pop();
                    this.undoActions.push(urs);
                    urs.forEach(ur => ur.redo());
                    this.changed(true);
                }
            };
            this.buttons = [];
            this.updateButtons = () => this.buttons.forEach(e => e.update());
            this.attachButtons = (toolbar) => {
                if (toolbar == null)
                    return;
                const me = this;
                function addButton(selector, enabled, action) {
                    toolbar.querySelectorAll(`button[data-tmm=${selector}]`).forEach(e => {
                        if (e instanceof HTMLButtonElement) {
                            e.addEventListener("click", action);
                            e.addEventListener("mousedown", (e) => e.preventDefault());
                            const button = {
                                update: () => e.disabled = !enabled()
                            };
                            me.buttons.push(button);
                            button.update();
                        }
                    });
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
            this.scale = 1;
            this.updateScale = (newScale) => {
                this.scale = Math.round(Math.max(0.1, newScale) * 100) / 100.0;
                this.mm.style.transform = `scale(${this.scale})`;
                this.redraw(false);
                window.localStorage.setItem("tmm.scale", "" + this.scale);
            };
            this.displaySize = () => new Point(this.container.offsetWidth, this.container.offsetHeight).divide(this.scale);
            this.canScaleUp = () => true;
            this.scaleUp = () => this.updateScale(this.scale * 1.5);
            this.canScaleDown = () => true;
            this.scaleDown = () => this.updateScale(this.scale / 1.5);
            this.canFitToContainer = () => this.ideas().length > 0;
            this.fitToContainer = () => {
                if (this.canFitToContainer()) {
                    const rect = this.ideas().length > 1 ? this.ideas().reduce((rect, idea) => idea.rect().union(rect), this.ideas()[0].rect()) : this.ideas()[0].rect();
                    this.moveRootIdeas(new Point(-rect.center.x, -rect.center.y));
                    const newSize = new Point(rect.width + 80, rect.height + 80);
                    this.updateScale(Math.min(this.container.offsetWidth / newSize.x, this.container.offsetHeight / newSize.y));
                }
            };
            this.initResizeObserver = () => {
                let containerWidth = this.container.offsetWidth, containerHeight = this.container.offsetHeight;
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
            this.canCollapse = () => this.selected().some(e => e.canCollapse());
            this.collapse = () => {
                if (this.canCollapse())
                    this.undoable(() => {
                        this.selected().filter(idea => idea.canCollapse()).forEach(idea => idea.collapsed = true);
                    });
            };
            this.canExpand = () => this.selected().some(e => e.canExpand());
            this.expand = () => {
                if (this.canExpand())
                    this.undoable(() => {
                        this.selected().filter(idea => idea.canExpand()).forEach(idea => idea.collapsed = false);
                    });
            };
            this.canMark = () => this.isMarking && this.hasSelected();
            this.mark = () => {
                if (this.canMark())
                    this.undoable(() => {
                        this.selected().forEach(s => s.marked = !s.marked);
                    });
            };
            this.displayCenter = () => this.displaySize().divide(2);
            this.toDisplayPos = (pos) => pos.plus(this.displayCenter());
            this.mouseToModelPos = (e) => {
                const rect = this.mm.getBoundingClientRect();
                return new Point(e.clientX - rect.left, e.clientY - rect.top).divide(this.scale).minus(this.displayCenter());
            };
            this.changed = (animation) => {
                this.redraw(animation);
                this.updateButtons();
                this.onChanged(this);
            };
            this.redraw = (animation) => {
                this.displaySize().toSize(this.mm);
                if (!animation)
                    this.mm.classList.add("no-animation");
                this.ideas().forEach(idea => idea.updateShadow());
                this.ideas().filter(idea => idea.dirty).forEach(idea => idea.computeSizes());
                this.layoutAll(false);
                this.ideas().forEach(idea => idea.drawElement());
                if (!animation)
                    window.setTimeout(() => this.mm.classList.remove("no-animation"), 0);
            };
            this.selected = () => this.ideas().filter(e => e.selected && !e.isHidden());
            this.hasSelected = () => this.selected().length > 0;
            this.isOneSelected = () => this.selected().length == 1;
            this.deselectAll = () => this.selected().forEach(idea => idea.selected = false);
            this.canLayout = () => this.ideas().length > 0;
            this.layout = (force) => {
                if (this.canLayout)
                    this.undoable(() => !this.hasSelected() ? this.layoutAll(force) : this.selected().forEach(idea => idea.layout(force)));
            };
            this.layoutAll = (force) => this.ideas().filter(idea => idea.level() == 1).forEach(idea => idea.layout(force));
            this.moveRootIdeas = (distance) => this.ideas().filter(idea => idea.level() == 1).forEach(idea => idea.move(distance));
            this.canRemove = () => this.isEditing && this.hasSelected();
            this.removeSelected = () => {
                if (this.canRemove())
                    this.undoable(() => {
                        const idea = this.isOneSelected() ? this.selected()[0].parent() : undefined;
                        this.selected().forEach(idea => idea.thisAndDescendants().map(i => this.remove(i.id)));
                        if (idea) {
                            idea.selected = true;
                            idea.scrollIntoView();
                        }
                    });
            };
            this.canAddSibling = () => this.isEditing && this.isOneSelected() && this.selected()[0].level() > 1;
            this.addSibling = () => {
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
                    });
                }
            };
            this.canAddChild = () => this.isEditing && (this.isOneSelected() || this.ideas().length == 0);
            this.addChild = () => {
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
                        }
                        else {
                            const child = this.add(this.createModel(this.nextId(), 0, "", "", new Point(0, 0), true));
                            window.setTimeout(child.edit, 0);
                        }
                    });
                }
            };
            this.blur = () => {
                const e = document.activeElement;
                if (e instanceof HTMLSpanElement && e.parentElement instanceof HTMLDivElement && this.ideasByElement.get(e.parentElement))
                    e.blur();
            };
            this.nextId = () => Math.max(...this.ideas().map(idea => idea.id)) + 1;
            this.onIdeaDo = (node, f) => {
                const idea = this.findIdeaByNode(node);
                if (idea)
                    f(idea);
            };
            this.findIdeaByNode = (node) => {
                if (node instanceof HTMLDivElement && node.parentElement == this.mm)
                    return this.ideasByElement.get(node);
                if (node != this.mm && node instanceof HTMLElement)
                    return this.findIdeaByNode(node.parentElement);
                return undefined;
            };
            this.turnWheel = (e) => {
                if (!this.forceCtrlForWheel || e.ctrlKey) {
                    e.preventDefault();
                    const newScale = this.scale * (1 + (e.deltaY > 0 ? -0.1 : 0.1));
                    const centerOffset = this.mouseToModelPos(e);
                    const distance = centerOffset.divide(newScale / this.scale).minus(centerOffset);
                    this.moveRootIdeas(distance);
                    this.updateScale(newScale);
                }
            };
            this.forceCtrlForWheel = true;
            this.moveAround = (e) => {
                const dh = new DragHandler(this.mm, e);
                dh.drag = (pos) => {
                    this.moveRootIdeas(pos.minus(dh.lastPos).divide(this.scale));
                    this.redraw(false);
                };
                dh.stopDrag = () => this.changed(false);
                dh.start();
            };
            this.moveIdea = (e, idea) => {
                const image = idea.element.cloneNode(true);
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
                dh.drag = (pos) => idea.elementPos().plus(pos.minus(dh.startPos).divide(this.scale)).toPosition(image);
                dh.drop = (e) => {
                    this.undoable(() => {
                        const wasLeft = idea.isLeft();
                        const target = this.findIdeaByNode(e.target);
                        if (target) {
                            const relative = this.mouseToModelPos(e);
                            if (target.level() == 1 && wasLeft != (target.absPos().x > relative.x)
                                || target.level() != 1 && target.isLeft() != wasLeft)
                                swap(idea.thisAndDescendants());
                            const taa = target.thisAndAncestors();
                            const idx = taa.indexOf(idea);
                            if (idx > 0) {
                                const follower = taa[idx - 1];
                                follower.parentId = idea.parentId;
                            }
                            idea.parentId = target.id;
                        }
                        else {
                            idea.move((new Point(e.clientX, e.clientY).minus(dh.startPos).divide(this.scale)));
                            if (idea.isLeft() != wasLeft)
                                swap(idea.descendants());
                        }
                        function swap(ideas) {
                            ideas.forEach(idea => idea.pos = new Point(-idea.pos.x, idea.pos.y));
                        }
                    });
                };
                dh.start();
            };
            this.toSvgPath = (level, from, to) => this.toCurvedSvgPath(from, to);
            this.toCurvedSvgPath = (from, to) => {
                const ox = from.x + (to.x - from.x) / 1.5;
                const oy = from.y;
                const ix = to.x - (to.x - from.x) / 2;
                const iy = to.y;
                return `M ${from.x} ${from.y} C ${ox} ${oy} ${ix} ${iy} ${to.x} ${to.y}`;
            };
            this.container = container;
            this.container.tabIndex = 0;
            this.mm = document.createElement("div");
            this.mm.className = "tmm";
            this.container.appendChild(this.mm);
            this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            this.mm.appendChild(this.svg);
            this.shadow = document.createElement("div");
            this.shadow.className = "tmm shadow";
            this.container.appendChild(this.shadow);
            container.addEventListener("mousedown", (e) => {
                if (e.button == 0 && !(e.ctrlKey || e.shiftKey || e.altKey || e.metaKey))
                    if (e.target == this.mm)
                        this.moveAround(e);
                    else
                        this.onIdeaDo(e.target, (idea) => this.moveIdea(e, idea));
            });
            container.addEventListener("wheel", this.turnWheel);
            container.addEventListener("keydown", (e) => {
                if (e.target == this.container && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) {
                    e.preventDefault();
                }
            });
            container.addEventListener("keyup", (e) => {
                if (!e.altKey && !e.metaKey) {
                    if (e.ctrlKey) {
                        "z" == e.key && this.undo();
                        "Z" == e.key && this.redo();
                        " " == e.key && this.mark();
                    }
                    else {
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
                            if (" " == e.key && this.isEditing)
                                current.edit();
                            "ArrowUp" == e.key && current.arrowUp();
                            "ArrowDown" == e.key && current.arrowDown();
                            "ArrowLeft" == e.key && current.arrowLeft();
                            "ArrowRight" == e.key && current.arrowRight();
                        }
                    }
                }
            });
            container.addEventListener("dblclick", (e) => this.onIdeaDo(e.target, (idea) => idea.edit()));
            container.addEventListener("click", (e) => {
                if (e.button == 0) {
                    if (e.target == this.mm) {
                        this.deselectAll();
                        this.changed(false);
                    }
                    else
                        this.onIdeaDo(e.target, idea => {
                            if (e.ctrlKey) {
                                idea.selected = !idea.selected;
                                this.changed(true);
                            }
                            else
                                idea.selectOnly();
                        });
                }
            });
            this.updateScale(parseFloat(window.localStorage.getItem('tmm.scale') || "1"));
            this.initResizeObserver();
        }
    }
    TwibsMindMaps.MindMap = MindMap;
    class Idea {
        constructor(mindMap) {
            this.id = 0;
            this.parentId = 0;
            this.title = "";
            this.key = "";
            this.pos = new Point(0, 0);
            this.selected = false;
            this.marked = false;
            this.collapsed = false;
            this.dirty = true;
            this.width = 0;
            this.height = 0;
            this.marginLeft = 0;
            this.marginRight = 0;
            this.marginTop = 0;
            this.marginBottom = 0;
            this.connectionOffsets = [];
            this.parent = () => this.id == this.parentId ? undefined : this.mindMap.ideasMap.get(this.parentId);
            this.level = () => this.parent() ? this.parent().level() + 1 : 1;
            this.isHidden = () => this.parent() ? this.parent().isHidden() || this.parent().isCollapsed() : false;
            this.isCollapsed = () => this.collapsed;
            this.isLeft = () => this.level() == 2 ? this.pos.x < 0 : this.parent() ? this.parent().isLeft() : false;
            this.canCollapse = () => !this.collapsed && this.children().length > 0;
            this.canExpand = () => this.collapsed && this.children().length > 0;
            this.children = () => this.mindMap.ideas().filter(idea => idea.parentId === this.id);
            this.thisAndAncestors = () => this.level() > 1 ? [this].concat(this.parent().thisAndAncestors()) : [this];
            this.thisAndDescendants = () => {
                const ret = [this];
                this.children().forEach(c => ret.push(...c.thisAndDescendants()));
                return ret;
            };
            this.descendants = () => {
                const ret = this.thisAndDescendants();
                ret.shift();
                return ret;
            };
            this.absPos = () => this.parent() ? this.parent().absPos().plus(this.isHidden() ? new Point(0, 0) : this.pos) : this.pos;
            this.elementPos = () => this.mindMap.toDisplayPos(this.rect().leftTop().minus(new Point(this.marginLeft, this.marginTop)));
            this.rect = () => this.absPos().minus(new Point(this.width / 2, this.height / 2)).toRect(this.width, this.height);
            this.connectionPoints = () => this.connectionOffsets.map(co => this.absPos().plus(co));
            this.update = (model) => {
                this.id = model.id;
                this.parentId = model.parentId;
                this.title = model.title;
                this.key = model.key;
                this.pos = new Point(model.x, model.y);
                this.selected = model.selected;
                this.marked = model.marked;
                this.collapsed = model.collapsed;
            };
            this.toModel = () => ({
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
            this.remove = () => {
                this.mindMap.ideasByShadow.delete(this.shadow);
                this.mindMap.ideasByElement.delete(this.element);
                this.mindMap.mm.removeChild(this.element);
                this.mindMap.shadow.removeChild(this.shadow);
                if (this.pathOption)
                    this.mindMap.svg.removeChild(this.pathOption);
            };
            this.updateShadow = () => {
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
            this.computeSizes = () => {
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
                    return new Point(this.toInt(ceStyle.left, ce.offsetLeft) + this.toInt(ceStyle.width, ce.offsetWidth) / 2 - this.width / 2, this.toInt(ceStyle.top, ce.offsetTop) + this.toInt(ceStyle.height, ce.offsetHeight) / 2 - this.height / 2);
                });
            };
            this.toInt = (px, fallback) => parseInt(px || "", 10) || fallback;
            this.layout = (force) => {
                if (this.level() == 1) {
                    this.doLayout(force, this.children().filter(i => i.isLeft()), true);
                    this.doLayout(force, this.children().filter(i => !i.isLeft()), false);
                    return this.rect();
                }
                else
                    return this.doLayout(force, this.children(), this.isLeft());
            };
            this.doLayout = (force, what, left) => {
                function moveLayout(layout, offset) {
                    layout.idea.move(new Point(0, offset));
                    layout.rect = layout.rect.plus(new Point(0, offset));
                    return layout.rect;
                }
                let ret = left
                    ? new Rectangle(this.rect().left, this.rect().top - this.marginTop, this.rect().width + this.marginRight, this.rect().height + this.marginTop)
                    : new Rectangle(this.rect().left - this.marginLeft, this.rect().top - this.marginTop, this.rect().width + this.marginLeft, this.rect().height + this.marginTop);
                if (!this.isCollapsed() && what.length > 0) {
                    const layouts = what.map(child => {
                        const cr = child.layout(force);
                        const shift = left
                            ? force || this.rect().left < cr.right ? new Point(this.rect().left - cr.right, 0) : new Point(0, 0)
                            : force || this.rect().right > cr.left ? new Point(this.rect().right - cr.left, 0) : new Point(0, 0);
                        child.move(shift);
                        return { idea: child, rect: cr.plus(shift) };
                    }).sort((a, b) => a.idea.pos.y - b.idea.pos.y);
                    const requiredSpace = layouts.map(i => i.rect.height).reduce((a, b) => a + b, 0);
                    if (force) {
                        let y = this.absPos().y - (requiredSpace - layouts[0].idea.marginTop) / 2;
                        layouts.forEach(layout => {
                            ret = ret.union(moveLayout(layout, y - layout.rect.top - layout.idea.marginTop));
                            y = y + layout.rect.height;
                        });
                    }
                    else {
                        recurse(layouts, layouts[0].rect.top, layouts[layouts.length - 1].rect.bottom, requiredSpace);
                    }
                }
                return ret;
                function recurse(layouts, upperBound, lowerBound, requiredSpace) {
                    if (layouts.length == 1) {
                        const one = layouts[0];
                        if (one.rect.top < upperBound)
                            moveLayout(one, upperBound - one.rect.top);
                        else if (one.rect.bottom > lowerBound)
                            moveLayout(one, -(one.rect.bottom - lowerBound));
                        ret = ret.union(one.rect);
                    }
                    else if (layouts.length > 1) {
                        const first = layouts.shift();
                        const last = layouts.pop();
                        const top = (first.rect.top < upperBound) ? upperBound : first.rect.top;
                        if (first.rect.top < upperBound)
                            moveLayout(first, upperBound - first.rect.top);
                        const bottom = (last.rect.bottom > lowerBound) ? lowerBound : last.rect.bottom;
                        if (last.rect.bottom > lowerBound)
                            moveLayout(last, -(last.rect.bottom - lowerBound));
                        const availableSpace = bottom - top;
                        if (requiredSpace > availableSpace) {
                            const upperSpace = top - upperBound;
                            const lowerSpace = lowerBound - bottom;
                            let firstOffset = -(requiredSpace - availableSpace);
                            let lastOffset = (requiredSpace - availableSpace);
                            if (upperSpace == 0 && lowerSpace == 0) {
                                firstOffset /= 2;
                                lastOffset /= 2;
                            }
                            else {
                                firstOffset *= upperSpace / (upperSpace + lowerSpace);
                                lastOffset *= lowerSpace / (upperSpace + lowerSpace);
                            }
                            moveLayout(first, firstOffset);
                            moveLayout(last, lastOffset);
                            ret = ret.union(first.rect).union(last.rect);
                            recurse(layouts, top + first.rect.height + firstOffset, bottom - last.rect.height + lastOffset, requiredSpace - first.rect.height - last.rect.height);
                        }
                        else {
                            ret = ret.union(first.rect).union(last.rect);
                            recurse(layouts, top + first.rect.height, bottom - last.rect.height, requiredSpace - first.rect.height - last.rect.height);
                        }
                    }
                }
            };
            this.toggleClasses = (e) => {
                e.classList.toggle("marked", this.marked);
                e.classList.toggle("selected", this.selected);
                e.classList.toggle("collapsed", this.collapsed);
            };
            this.drawElement = () => {
                this.elementPos().toPosition(this.element);
                new Point(this.width, this.height).toSize(this.element);
                if (!this.element.classList.contains(`l${this.level()}`))
                    this.element.className = `l${this.level()}`;
                this.element.classList.toggle("hidden", this.isHidden());
                this.toggleClasses(this.element);
                if (!this.titleElement.isContentEditable && this.titleElement.innerHTML != this.title)
                    this.titleElement.innerHTML = this.title;
                if (this.level() > 1) {
                    const parentConnectionPoints = this.parent().connectionPoints();
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
                }
                else if (this.pathOption) {
                    this.mindMap.svg.removeChild(this.pathOption);
                    this.pathOption = undefined;
                }
            };
            this.path = () => this.pathOption || this.initPath();
            this.pathOption = undefined;
            this.initPath = () => {
                const ret = document.createElementNS("http://www.w3.org/2000/svg", "path");
                this.mindMap.svg.appendChild(ret);
                this.pathOption = ret;
                return ret;
            };
            this.move = (distance) => this.pos = this.pos.plus(distance);
            this.snapshot = [];
            this.edit = () => {
                if (this.mindMap.isEditing && this.titleElement.contentEditable != "true") {
                    this.titleElement.contentEditable = "true";
                    this.scrollIntoView();
                    this.snapshot = this.mindMap.toModels();
                    this.mindMap.redraw(true);
                    this.titleElement.focus();
                }
            };
            this.scrollIntoView = () => {
                const dr = this.rect();
                const displayCenter = this.mindMap.displayCenter();
                let offsetX = 0;
                let offsetY = 0;
                if (dr.right + this.marginRight > displayCenter.x)
                    offsetX = displayCenter.x - (dr.right + this.marginRight);
                if (dr.left - this.marginLeft < -displayCenter.x)
                    offsetX = -displayCenter.x - (dr.left - this.marginLeft);
                if (dr.bottom + this.marginBottom > displayCenter.y)
                    offsetY = displayCenter.y - (dr.bottom + this.marginBottom);
                if (dr.top - this.marginTop < -displayCenter.y)
                    offsetY = -displayCenter.y - (dr.top - this.marginTop);
                if (offsetX != 0 || offsetY != 0) {
                    this.mindMap.moveRootIdeas(new Point(offsetX, offsetY));
                    return true;
                }
                return false;
            };
            this.arrowUp = () => this.previousSibling() ? this.previousSibling().selectOnly() : this.arrow((i, c) => i.y < c.y);
            this.arrowDown = () => this.nextSibling() ? this.nextSibling().selectOnly() : this.arrow((i, c) => i.y > c.y);
            this.previousSibling = () => this.siblings().filter(idea => idea.isLeft() == this.isLeft() && idea.pos.y < this.pos.y).reverse()[0];
            this.nextSibling = () => this.siblings().filter(idea => idea.isLeft() == this.isLeft() && idea.pos.y > this.pos.y)[0];
            this.siblings = () => this.parent() ? this.parent().children().filter(idea => idea != this).sort((a, b) => a.pos.y - b.pos.y) : [];
            this.arrowLeft = () => this.level() != 1 && !this.isLeft() ? this.parent().selectOnly() : this.childOrNearest(this.leftChildren(), (i, c) => i.x < c.x);
            this.arrowRight = () => this.level() != 1 && this.isLeft() ? this.parent().selectOnly() : this.childOrNearest(this.rightChildren(), (i, c) => i.x > c.x);
            this.leftChildren = () => this.children().filter(idea => !idea.isHidden()).filter(idea => idea.absPos().x < this.absPos().x);
            this.rightChildren = () => this.children().filter(idea => !idea.isHidden()).filter(idea => idea.absPos().x > this.absPos().x);
            this.childOrNearest = (vc, filter) => (vc.length > 0 ? this.findNearest(vc).selectOnly() : this.arrow(filter));
            this.arrow = (filter) => {
                const to = this.findNearest(this.mindMap.ideas().filter(idea => !idea.isHidden()).filter(idea => filter(idea.absPos(), this.absPos())));
                if (to)
                    to.selectOnly();
            };
            this.findNearest = (ideas) => {
                const s = ideas.map(idea => ({
                    idea: idea,
                    distance: this.absPos().distance(idea.absPos())
                })).sort((a, b) => a.distance - b.distance)[0];
                return s ? s.idea : undefined;
            };
            this.selectOnly = () => {
                this.mindMap.deselectAll();
                this.selected = true;
                this.scrollIntoView();
                this.mindMap.changed(true);
            };
            this.mindMap = mindMap;
            this.element = document.createElement("div");
            this.titleElement = document.createElement("span");
            this.element.appendChild(this.titleElement);
            this.mindMap.mm.appendChild(this.element);
            this.mindMap.ideasByElement.set(this.element, this);
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
            this.titleElement.addEventListener("keydown", (e) => e.key == "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.preventDefault());
            this.titleElement.addEventListener("keyup", (e) => {
                e.stopPropagation();
                if (e.key == "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    this.mindMap.container.focus();
                }
                else if (e.key == "Escape" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    this.titleElement.innerHTML = this.title;
                    this.mindMap.container.focus();
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
                }
                else {
                    this.snapshot.forEach(m => this.mindMap.ideasMap.get(m.id).update(m));
                    this.mindMap.changed(true);
                }
            });
        }
    }
    TwibsMindMaps.Idea = Idea;
    const mindMaps = new Map();
    function init(el) {
        if (el == null)
            throw "Element must not be null";
        const existing = mindMaps.get(el);
        if (existing)
            return existing;
        const ret = new MindMap(el);
        mindMaps.set(el, ret);
        return ret;
    }
    TwibsMindMaps.init = init;
    class DragHandler {
        constructor(container, startEvent) {
            this.dragging = false;
            this.minDistance = 4;
            this.keyUp = (e) => {
                if (e.key == "Escape")
                    this.stop();
            };
            this.mouseUp = (e) => {
                this.stop();
                if (this.dragging)
                    this.drop(e);
            };
            this.click = (e) => {
                if (this.dragging) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            this.mouseMove = (e) => {
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
            this.start = () => {
                document.addEventListener("click", this.click, true);
                this.container.addEventListener("mouseup", this.mouseUp);
                this.container.addEventListener("mousemove", this.mouseMove);
                document.addEventListener("mouseup", this.stop);
                document.addEventListener("keyup", this.keyUp);
            };
            this.stop = () => {
                if (this.dragging) {
                    this.stopDrag();
                    this.container.classList.remove("dragging");
                }
                window.setTimeout(() => document.removeEventListener("click", this.click, true), 0);
                this.container.removeEventListener("mousemove", this.mouseMove);
                this.container.removeEventListener("mouseup", this.mouseUp);
                document.removeEventListener("mouseup", this.stop);
                document.removeEventListener("keyup", this.keyUp);
            };
            this.startDrag = () => {
            };
            this.drag = (pos) => {
            };
            this.drop = (e) => {
            };
            this.stopDrag = () => {
            };
            this.container = container;
            this.startEvent = startEvent;
            this.startPos = new Point(this.startEvent.clientX, this.startEvent.clientY);
            this.lastPos = this.startPos;
        }
    }
    class Point {
        constructor(x, y) {
            this.distance = (other) => Math.sqrt(Math.pow(this.x - other.x, 2) + Math.pow(this.y - other.y, 2));
            this.length = () => this.distance(new Point(0, 0));
            this.minus = (point) => new Point(this.x - point.x, this.y - point.y);
            this.divide = (scale) => new Point(this.x / scale, this.y / scale);
            this.plus = (point) => new Point(this.x + point.x, this.y + point.y);
            this.toPosition = (element) => {
                const left = this.x + "px";
                const top = this.y + "px";
                if (element.style.left != left)
                    element.style.left = left;
                if (element.style.top != top)
                    element.style.top = top;
            };
            this.toSize = (element) => {
                const width = this.x + "px";
                const height = this.y + "px";
                if (element.style.width != width)
                    element.style.width = width;
                if (element.style.height != height)
                    element.style.height = height;
            };
            this.toRect = (width, height) => new Rectangle(this.x, this.y, width, height);
            this.x = x;
            this.y = y;
        }
    }
    class Rectangle {
        constructor(left, top, width, height) {
            this.union = (rect) => {
                const nx = Math.min(this.left, rect.left);
                const ny = Math.min(this.top, rect.top);
                return new Rectangle(nx, ny, Math.max(this.right, rect.right) - nx, Math.max(this.bottom, rect.bottom) - ny);
            };
            this.minus = (point) => new Rectangle(this.left - point.x, this.top - point.y, this.width, this.height);
            this.plus = (point) => new Rectangle(this.left + point.x, this.top + point.y, this.width, this.height);
            this.divide = (scale) => new Rectangle(this.left / scale, this.top / scale, this.width / scale, this.height / scale);
            this.leftTop = () => new Point(this.left, this.top);
            this.left = left;
            this.top = top;
            this.width = width;
            this.height = height;
            this.center = new Point(this.left + this.width / 2, this.top + this.height / 2);
            this.right = this.left + this.width;
            this.bottom = this.top + this.height;
        }
    }
})(TwibsMindMaps || (TwibsMindMaps = {}));
