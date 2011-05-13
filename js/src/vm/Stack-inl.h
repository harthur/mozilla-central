/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * vim: set ts=4 sw=4 et tw=79 ft=cpp:
 *
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is SpiderMonkey JavaScript engine.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Luke Wagner <luke@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

#ifndef Stack_inl_h__
#define Stack_inl_h__

#include "jscntxt.h"
#include "jscompartment.h"

#include "Stack.h"

#include "ArgumentsObject-inl.h"

namespace js {

inline void
StackFrame::initPrev(JSContext *cx)
{
    JS_ASSERT(flags_ & HAS_PREVPC);
    if (FrameRegs *regs = cx->maybeRegs()) {
        prev_ = regs->fp();
        prevpc_ = regs->pc;
        JS_ASSERT_IF(!prev_->isDummyFrame() && !prev_->hasImacropc(),
                     uint32(prevpc_ - prev_->script()->code) < prev_->script()->length);
    } else {
        prev_ = NULL;
#ifdef DEBUG
        prevpc_ = (jsbytecode *)0xbadc;
#endif
    }
}

inline void
StackFrame::resetGeneratorPrev(JSContext *cx)
{
    flags_ |= HAS_PREVPC;
    initPrev(cx);
}

inline void
StackFrame::initCallFrame(JSContext *cx, JSObject &callee, JSFunction *fun,
                          JSScript *script, uint32 nactual, StackFrame::Flags flagsArg)
{
    JS_ASSERT((flagsArg & ~(CONSTRUCTING |
                            OVERFLOW_ARGS |
                            UNDERFLOW_ARGS)) == 0);
    JS_ASSERT(fun == callee.getFunctionPrivate());
    JS_ASSERT(script == fun->script());

    /* Initialize stack frame members. */
    flags_ = FUNCTION | HAS_PREVPC | HAS_SCOPECHAIN | flagsArg;
    exec.fun = fun;
    args.nactual = nactual;  /* only need to write if over/under-flow */
    scopeChain_ = callee.getParent();
    initPrev(cx);
    JS_ASSERT(!hasImacropc());
    JS_ASSERT(!hasHookData());
    JS_ASSERT(annotation() == NULL);
    JS_ASSERT(!hasCallObj());

    SetValueRangeToUndefined(slots(), script->nfixed);
}

inline void
StackFrame::resetCallFrame(JSScript *script)
{
    JS_ASSERT(script == this->script());

    /* Undo changes to frame made during execution; see also initCallFrame */

    putActivationObjects();

    if (flags_ & UNDERFLOW_ARGS)
        SetValueRangeToUndefined(formalArgs() + numActualArgs(), formalArgsEnd());

    JS_ASSERT(!(flags_ & ~(FUNCTION |
                           OVERFLOW_ARGS |
                           UNDERFLOW_ARGS |
                           OVERRIDE_ARGS |
                           HAS_PREVPC |
                           HAS_RVAL |
                           HAS_SCOPECHAIN |
                           HAS_ANNOTATION |
                           HAS_HOOK_DATA |
                           HAS_CALL_OBJ |
                           HAS_ARGS_OBJ |
                           FINISHED_IN_INTERP)));

    /*
     * Since the stack frame is usually popped after PutActivationObjects,
     * these bits aren't cleared. The activation objects must have actually
     * been put, though.
     */
    JS_ASSERT_IF(flags_ & HAS_CALL_OBJ, callObj().getPrivate() == NULL);
    JS_ASSERT_IF(flags_ & HAS_ARGS_OBJ, argsObj().getPrivate() == NULL);

    flags_ &= FUNCTION |
              OVERFLOW_ARGS |
              HAS_PREVPC |
              UNDERFLOW_ARGS;

    JS_ASSERT(exec.fun == callee().getFunctionPrivate());
    scopeChain_ = callee().getParent();

    SetValueRangeToUndefined(slots(), script->nfixed);
}

inline void
StackFrame::initJitFrameCallerHalf(JSContext *cx, StackFrame::Flags flags,
                                    void *ncode)
{
    JS_ASSERT((flags & ~(CONSTRUCTING |
                         FUNCTION |
                         OVERFLOW_ARGS |
                         UNDERFLOW_ARGS)) == 0);

    flags_ = FUNCTION | flags;
    prev_ = cx->fp();
    ncode_ = ncode;
}

/*
 * The "early prologue" refers to the members that are stored for the benefit
 * of slow paths before initializing the rest of the members.
 */
inline void
StackFrame::initJitFrameEarlyPrologue(JSFunction *fun, uint32 nactual)
{
    exec.fun = fun;
    if (flags_ & (OVERFLOW_ARGS | UNDERFLOW_ARGS))
        args.nactual = nactual;
}

/*
 * The "late prologue" refers to the members that are stored after having
 * checked for stack overflow and formal/actual arg mismatch.
 */
inline void
StackFrame::initJitFrameLatePrologue()
{
    SetValueRangeToUndefined(slots(), script()->nfixed);
}

inline Value &
StackFrame::canonicalActualArg(uintN i) const
{
    if (i < numFormalArgs())
        return formalArg(i);
    JS_ASSERT(i < numActualArgs());
    return actualArgs()[i];
}

template <class Op>
inline bool
StackFrame::forEachCanonicalActualArg(Op op, uintN start /* = 0 */, uintN count /* = uintN(-1) */)
{
    uintN nformal = fun()->nargs;
    JS_ASSERT(start <= nformal);

    Value *formals = formalArgsEnd() - nformal;
    uintN nactual = numActualArgs();
    if (count == uintN(-1))
        count = nactual - start;

    uintN end = start + count;
    JS_ASSERT(end >= start);
    JS_ASSERT(end <= nactual);

    if (end <= nformal) {
        Value *p = formals + start;
        for (; start < end; ++p, ++start) {
            if (!op(start, p))
                return false;
        }
    } else {
        for (Value *p = formals + start; start < nformal; ++p, ++start) {
            if (!op(start, p))
                return false;
        }
        JS_ASSERT(start >= nformal);
        Value *actuals = formals - (nactual + 2) + start;
        for (Value *p = actuals; start < end; ++p, ++start) {
            if (!op(start, p))
                return false;
        }
    }
    return true;
}

template <class Op>
inline bool
StackFrame::forEachFormalArg(Op op)
{
    Value *formals = formalArgsEnd() - fun()->nargs;
    Value *formalsEnd = formalArgsEnd();
    uintN i = 0;
    for (Value *p = formals; p != formalsEnd; ++p, ++i) {
        if (!op(i, p))
            return false;
    }
    return true;
}

struct CopyTo
{
    Value *dst;
    CopyTo(Value *dst) : dst(dst) {}
    bool operator()(uintN, Value *src) {
        *dst++ = *src;
        return true;
    }
};

inline uintN
StackFrame::numActualArgs() const
{
    JS_ASSERT(hasArgs());
    if (JS_UNLIKELY(flags_ & (OVERFLOW_ARGS | UNDERFLOW_ARGS)))
        return hasArgsObj() ? argsObj().initialLength() : args.nactual;
    return numFormalArgs();
}

inline Value *
StackFrame::actualArgs() const
{
    JS_ASSERT(hasArgs());
    Value *argv = formalArgs();
    if (JS_UNLIKELY(flags_ & OVERFLOW_ARGS)) {
        uintN nactual = hasArgsObj() ? argsObj().initialLength() : args.nactual;
        return argv - (2 + nactual);
    }
    return argv;
}

inline Value *
StackFrame::actualArgsEnd() const
{
    JS_ASSERT(hasArgs());
    if (JS_UNLIKELY(flags_ & OVERFLOW_ARGS))
        return formalArgs() - 2;
    return formalArgs() + numActualArgs();
}

inline void
StackFrame::setArgsObj(ArgumentsObject &obj)
{
    JS_ASSERT_IF(hasArgsObj(), &obj == args.obj);
    JS_ASSERT_IF(!hasArgsObj(), numActualArgs() == obj.initialLength());
    args.obj = &obj;
    flags_ |= HAS_ARGS_OBJ;
}

inline void
StackFrame::setScopeChainNoCallObj(JSObject &obj)
{
#ifdef DEBUG
    JS_ASSERT(&obj != NULL);
    if (&obj != sInvalidScopeChain) {
        if (hasCallObj()) {
            JSObject *pobj = &obj;
            while (pobj && pobj->getPrivate() != this)
                pobj = pobj->getParent();
            JS_ASSERT(pobj);
        } else {
            for (JSObject *pobj = &obj; pobj; pobj = pobj->getParent())
                JS_ASSERT_IF(pobj->isCall(), pobj->getPrivate() != this);
        }
    }
#endif
    scopeChain_ = &obj;
    flags_ |= HAS_SCOPECHAIN;
}

inline void
StackFrame::setScopeChainWithOwnCallObj(JSObject &obj)
{
    JS_ASSERT(&obj != NULL);
    JS_ASSERT(!hasCallObj() && obj.isCall() && obj.getPrivate() == this);
    scopeChain_ = &obj;
    flags_ |= HAS_SCOPECHAIN | HAS_CALL_OBJ;
}

inline JSObject &
StackFrame::callObj() const
{
    JS_ASSERT_IF(isNonEvalFunctionFrame() || isStrictEvalFrame(), hasCallObj());

    JSObject *pobj = &scopeChain();
    while (JS_UNLIKELY(pobj->getClass() != &js_CallClass)) {
        JS_ASSERT(IsCacheableNonGlobalScope(pobj) || pobj->isWith());
        pobj = pobj->getParent();
    }
    return *pobj;
}

inline void
StackFrame::putActivationObjects()
{
    if (flags_ & (HAS_ARGS_OBJ | HAS_CALL_OBJ)) {
        /* NB: there is an ordering dependency here. */
        if (hasCallObj())
            js_PutCallObject(this);
        else if (hasArgsObj())
            js_PutArgsObject(this);
    }
}

inline void
StackFrame::markActivationObjectsAsPut()
{
    if (flags_ & (HAS_ARGS_OBJ | HAS_CALL_OBJ)) {
        if (hasArgsObj() && !argsObj().getPrivate()) {
            args.nactual = args.obj->initialLength();
            flags_ &= ~HAS_ARGS_OBJ;
        }
        if (hasCallObj() && !callObj().getPrivate()) {
            /*
             * For function frames, the call object may or may not have have an
             * enclosing DeclEnv object, so we use the callee's parent, since
             * it was the initial scope chain. For global (strict) eval frames,
             * there is no calle, but the call object's parent is the initial
             * scope chain.
             */
            scopeChain_ = isFunctionFrame()
                          ? callee().getParent()
                          : scopeChain_->getParent();
            flags_ &= ~HAS_CALL_OBJ;
        }
    }
}

/*****************************************************************************/

#ifdef JS_TRACER
JS_ALWAYS_INLINE bool
StackSpace::ensureEnoughSpaceToEnterTrace()
{
    ptrdiff_t needed = TraceNativeStorage::MAX_NATIVE_STACK_SLOTS +
                       TraceNativeStorage::MAX_CALL_STACK_ENTRIES * VALUES_PER_STACK_FRAME;
#ifdef XP_WIN
    return ensureSpace(NULL, firstUnused(), needed);
#else
    return end_ - firstUnused() > needed;
#endif
}
#endif

STATIC_POSTCONDITION(!return || ubound(from) >= nvals)
JS_ALWAYS_INLINE bool
StackSpace::ensureSpace(JSContext *maybecx, Value *from, ptrdiff_t nvals) const
{
    JS_ASSERT(from >= firstUnused());
#ifdef XP_WIN
    JS_ASSERT(from <= commitEnd_);
    if (commitEnd_ - from < nvals)
        return bumpCommit(maybecx, from, nvals);
    return true;
#else
    if (end_ - from < nvals) {
        js_ReportOverRecursed(maybecx);
        return false;
    }
    return true;
#endif
}

inline Value *
StackSpace::getStackLimit(JSContext *cx)
{
    Value *limit;
#ifdef XP_WIN
    limit = commitEnd_;
#else
    limit = end_;
#endif

    /* See getStackLimit comment in Stack.h. */
    FrameRegs &regs = cx->regs();
    uintN minSpace = regs.fp()->numSlots() + VALUES_PER_STACK_FRAME;
    if (regs.sp + minSpace > limit) {
        js_ReportOverRecursed(cx);
        return NULL;
    }

    return limit;
}

/*****************************************************************************/

JS_ALWAYS_INLINE bool
OOMCheck::operator()(JSContext *cx, StackSpace &space, Value *from, uintN nvals)
{
    return space.ensureSpace(cx, from, nvals);
}

JS_ALWAYS_INLINE bool
LimitCheck::operator()(JSContext *cx, StackSpace &space, Value *from, uintN nvals)
{
    /*
     * Include an extra sizeof(StackFrame) to satisfy the method-jit
     * stackLimit invariant.
     */
    nvals += VALUES_PER_STACK_FRAME;
    JS_ASSERT(from < *limit);
    if (*limit - from >= ptrdiff_t(nvals))
        return true;
    return space.tryBumpLimit(cx, from, nvals, limit);
}

template <class Check>
JS_ALWAYS_INLINE StackFrame *
ContextStack::getCallFrame(JSContext *cx, const CallArgs &args,
                           JSFunction *fun, JSScript *script,
                           StackFrame::Flags *flags, Check check) const
{
    JS_ASSERT(fun->script() == script);
    JS_ASSERT(space().firstUnused() == args.end());

    Value *firstUnused = args.end();
    uintN nvals = VALUES_PER_STACK_FRAME + script->nslots;
    uintN nformal = fun->nargs;

    /* Maintain layout invariant: &formalArgs[0] == ((Value *)fp) - nformal. */

    if (args.argc() == nformal) {
        if (JS_UNLIKELY(!check(cx, space(), firstUnused, nvals)))
            return NULL;
        return reinterpret_cast<StackFrame *>(firstUnused);
    }

    if (args.argc() < nformal) {
        *flags = StackFrame::Flags(*flags | StackFrame::UNDERFLOW_ARGS);
        uintN nmissing = nformal - args.argc();
        if (JS_UNLIKELY(!check(cx, space(), firstUnused, nmissing + nvals)))
            return NULL;
        SetValueRangeToUndefined(firstUnused, nmissing);
        return reinterpret_cast<StackFrame *>(firstUnused + nmissing);
    }

    *flags = StackFrame::Flags(*flags | StackFrame::OVERFLOW_ARGS);
    uintN ncopy = 2 + nformal;
    if (JS_UNLIKELY(!check(cx, space(), firstUnused, ncopy + nvals)))
        return NULL;

    Value *dst = firstUnused;
    Value *src = args.base();
    PodCopy(dst, src, ncopy);
    return reinterpret_cast<StackFrame *>(firstUnused + ncopy);
}

template <class Check>
JS_ALWAYS_INLINE bool
ContextStack::pushInlineFrame(JSContext *cx, FrameRegs &regs, const CallArgs &args,
                              JSObject &callee, JSFunction *fun, JSScript *script,
                              MaybeConstruct construct, Check check)
{
    JS_ASSERT(onTop());
    JS_ASSERT(&regs == &seg_->regs());
    JS_ASSERT(regs.sp == args.end());
    /* Cannot assert callee == args.callee() since this is called from LeaveTree. */
    JS_ASSERT(callee.getFunctionPrivate() == fun);
    JS_ASSERT(fun->script() == script);

    StackFrame::Flags flags = ToFrameFlags(construct);
    StackFrame *fp = getCallFrame(cx, args, fun, script, &flags, check);
    if (!fp)
        return false;

    /* Initialize frame, locals, regs. */
    fp->initCallFrame(cx, callee, fun, script, args.argc(), flags);
    regs.prepareToRun(*fp, script);
    return true;
}

JS_ALWAYS_INLINE StackFrame *
ContextStack::getFixupFrame(JSContext *cx, FrameRegs &regs, const CallArgs &args,
                            JSFunction *fun, JSScript *script, void *ncode,
                            MaybeConstruct construct, LimitCheck check)
{
    JS_ASSERT(onTop());
    JS_ASSERT(&regs == &cx->regs());
    JS_ASSERT(regs.sp == args.end());
    JS_ASSERT(args.callee().getFunctionPrivate() == fun);
    JS_ASSERT(fun->script() == script);

    StackFrame::Flags flags = ToFrameFlags(construct);
    StackFrame *fp = getCallFrame(cx, args, fun, script, &flags, check);
    if (!fp)
        return NULL;

    /* Do not init late prologue or regs; this is done by jit code. */
    fp->initJitFrameCallerHalf(cx, flags, ncode);
    fp->initJitFrameEarlyPrologue(fun, args.argc());
    return fp;
}

JS_ALWAYS_INLINE void
ContextStack::popInlineFrame(FrameRegs &regs)
{
    JS_ASSERT(onTop());
    JS_ASSERT(&regs == &seg_->regs());

    StackFrame *fp = regs.fp();
    fp->putActivationObjects();

    Value *newsp = fp->actualArgs() - 1;
    JS_ASSERT(newsp >= fp->prev()->base());

    newsp[-1] = fp->returnValue();
    regs.popFrame(newsp);
}

inline void
ContextStack::popFrameAfterOverflow()
{
    /* Restore the regs to what they were on entry to JSOP_CALL. */
    FrameRegs &regs = seg_->regs();
    StackFrame *fp = regs.fp();
    regs.popFrame(fp->actualArgsEnd());
}

namespace detail {

struct STATIC_SKIP_INFERENCE CopyNonHoleArgsTo
{
    CopyNonHoleArgsTo(ArgumentsObject *argsobj, Value *dst) : argsobj(*argsobj), dst(dst) {}
    ArgumentsObject &argsobj;
    Value *dst;
    bool operator()(uint32 argi, Value *src) {
        if (argsobj.element(argi).isMagic(JS_ARGS_HOLE))
            return false;
        *dst++ = *src;
        return true;
    }
};

} /* namespace detail */

inline bool
ArgumentsObject::getElement(uint32 i, Value *vp)
{
    if (i >= initialLength())
        return false;

    *vp = element(i);

    /*
     * If the argument was overwritten, it could be in any object slot, so we
     * can't optimize.
     */
    if (vp->isMagic(JS_ARGS_HOLE))
        return false;

    /*
     * If this arguments object was created on trace the actual argument value
     * could be in a register or something, so we can't optimize.
     */
    StackFrame *fp = reinterpret_cast<StackFrame *>(getPrivate());
    if (fp == JS_ARGUMENTS_OBJECT_ON_TRACE)
        return false;

    /*
     * If this arguments object has an associated stack frame, that contains
     * the canonical argument value.  Note that strict arguments objects do not
     * alias named arguments and never have a stack frame.
     */
    JS_ASSERT_IF(isStrictArguments(), !fp);
    if (fp)
        *vp = fp->canonicalActualArg(i);
    return true;
}

inline bool
ArgumentsObject::getElements(uint32 start, uint32 count, Value *vp)
{
    JS_ASSERT(start + count >= start);

    uint32 length = initialLength();
    if (start > length || start + count > length)
        return false;

    StackFrame *fp = reinterpret_cast<StackFrame *>(getPrivate());

    /* If there's no stack frame for this, argument values are in elements(). */
    if (!fp) {
        Value *srcbeg = elements() + start;
        Value *srcend = srcbeg + count;
        for (Value *dst = vp, *src = srcbeg; src < srcend; ++dst, ++src) {
            if (src->isMagic(JS_ARGS_HOLE))
                return false;
            *dst = *src;
        }
        return true;
    }

    /* If we're on trace, there's no canonical location for elements: fail. */
    if (fp == JS_ARGUMENTS_OBJECT_ON_TRACE)
        return false;

    /* Otherwise, element values are on the stack. */
    JS_ASSERT(fp->numActualArgs() <= JS_ARGS_LENGTH_MAX);
    return fp->forEachCanonicalActualArg(detail::CopyNonHoleArgsTo(this, vp), start, count);
}

} /* namespace js */
#endif /* Stack_inl_h__ */
