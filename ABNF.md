# bsencode in Augmented Backus-Naur Form

The goal of this section is a description of bsencode in ABNF. ABNF is a
language defined in [RFC 4234](https://www.ietf.org/rfc/rfc4234). In order to
describe bsencode, it will be necessary to use a "prose description" to define
bsencode's `bstr` type -- this appears to be a fundamental limitation of ABNF,
that ABNF cannot encode netstrings.

After the grammar is defined, I will talk in the following section about some
modifications of ABNF that could describe netstrings. This is not a serious
proposal for any of those modifications, but just a discussion of what is
perhaps still missing from ABNF.

## Defining BENCODE-STR

Before we begin, I will have to describe netstrings in RFC 4234's ABNF syntax.
Netstrings appear in many places, including BitTorrent's bencode format, which
bsencode derives from. It's a neat idea: a set of ASCII digits encode a decimal
number N, followed by a `:` character in case the string starts with decimal
digits as well. This character is then followed by N arbitrary bytes.

The clearest description of this in RFC 4234-compliant notation is:

    BENCODE-STR = "0:" 0OCTET / "1:" 1OCTET / "2:" 2OCTET / "3:" 3OCTET /
                  "4:" 4OCTET / "5:" 5OCTET / "6:" 6OCTET / "7:" 7OCTET /
                  "8:" 8OCTET / "9:" 9OCTET / "10:" 10OCTET / <...>

This uses the angle-bracketed "prose description, to be used as last resort"
mentioned in  RFC 4234 section 4 to indicate that the pattern continues
*ad infinitum*.

The official [netstring](http://cr.yp.to/proto/netstrings.txt) description
involves using `BENCODE-STR ","` to encode a netstring; bencode just uses
`BENCODE-STR`. My language bsencode breaks with both of these: because I wanted
digits to encode integers, and I wanted a simple parser, I elected to begin a 
netstring with the special character `'` -- a quote, because it is after all a 
string; it is a single-quote because someone may wish to add JSON-style double
quoted strings sometime in the future.

## The rest of the grammar

Given `BENCODE-STR`, I can define the rest of the core bsencode grammar with
only the normal ABNF rules as:

      expr    = bstr / list / symbol

      ; Syntax Types: binary strings, lists, and symbols.
      bstr    = "'" BENCODE-STR     ; '23:An example byte string.

      list    = array / bin / date / dict / float / regex

      symbol  = true / false / null / int

      ; List Types: arrays and diverse objects
      array   = "(" [expr *(" " expr)] ")"

      bin     = "(" s-bin " " bstr ")"

      date    = "(" s-date " " datestr ")"

      dict    = "(" s-dict *key-val ")"

      float   = "(" s-float " '8:" 8OCTET ")"

      regex   = "(" s-regex " " bstr " " reflags ")"

      ; Symbol Types: subset of JSON.
      true   = %x74.72.75.65        ; true

      false  = %x66.61.6c.73.65     ; false

      null   = %x6e.75.6c.6c        ; null

      int     = "0" / nz_int        ; Integer. Excludes -0.

      ; Auxiliary Definitions

        ; nonzero integer type used for ints.
      nz_int  = ["-"] dig1-9 *DIGIT

        ; dictionary key-value pairs are wrapped in parens
      key-val = " (" bstr " " expr ")"

        ; regex flags admit optionally g, i, and m in that order
      reflags = ":" [%x67] [%x69] [%x6d]

        ; date format, subset of RFC 3339
      datestr = 4DIGIT "-" 2DIGIT "-" 2DIGIT s-T
                2DIGIT ":" 2DIGIT ":" 2DIGIT "." 3DIGIT s-Z

      ; Character Definitions
      dig1-9  = %x31-39             ; 1-9

      s-T     = %x54                ; T

      s-Z     = %x5a                ; Z

      s-bin   = %x62.69.6e          ; bin

      s-date  = %x64.61.74.65       ; date

      s-dict  = %x64.69.63.74       ; dict

      s-float = %x66.6c.6f.61.74;   ; float

      s-regex = %x72.65.67.65.78    ; regex

# Alternate definitions of BENCODE-STR

My above definition describes `BENCODE-STR` by appealing to an infinite
hierarchy of simple rules. Unfortunately, the syntax I've used is basically 
unusable by an ABNF parser, even though it's clear and unambiguous to humans 
and easy for our computers to parse. *Can* ABNF handle netstrings? My gut 
instinct is "no".

ABNF doesn't quite have proper arithmetic, by which we could convert one form
of a number into another, and netstrings encode the same number *N* in two ways
 -- as ASCII decimal digits and as the length of a string. The only "glue" that
ABNF provides is concatenation, which cannot be undone; since it cannot be 
undone, I believe the only recursive decomposition allowed is:

    BENCODE-STR =/ <m> BENCODE-STR <m * 10^n octets>

But ABNF also doesn't have the arithmetic needed to describe 10^n octets. So it
seems it doesn't have the expressive capability to describe netstrings at all.
I present this as a sort of conjecture, because I'm not completely certain 
about the middle steps -- does ABNF really *need* to "glue" these two different
representations together? 

And if ABNF *doesn't* work, then what *does*?

## A minimal solution

The simplest way to do this is to add onto ABNF the rules:

    num-val /= "$"
    repeat  /= "#" / ("#*" *DIGIT) / (*DIGIT "*#")

We interpret them as follows: a rule containing `#` or `$` represents a family
of rules for each integer 0, 1, 2, ...,  with that integer standing in for the
symbols `#` and `$` throughout the rule -- that is, this integer is the same
for all `#` and for all `$`. The difference between these symbols is that `$`
is the ASCII representation of the integer, while `#` is the integer itself
appearing in a repetition clause. Then `BENCODE-STR` can be written as:

    BENCODE-STR = $ ":" #OCTET

It more or less manufactures the rules that we need in order to express the
infinite hierarchy above; a more sophisticated approach might allow these to
bind to separate variables too -- `$(n)` might always be the same number as
`#(n)` but distinct from `$(m)` -- but we do not need this complexity for this
particular task.

## With local ABNF rules

The first proposal only adds the bare minimum of new ideas to effect netstrings
in ABNF and therefore feels mathematically unsatisfying, so I came up with the 
idea of adding a new "glue" in the form of ABNF with local rule bindings. I 
shall call this LABNF for the purposes of this section; if ABNF grammars were 
translated into function calls, LABNF would allow those calls to have proper
function arguments.

To get LABNF, I add two rules to the ABNF description of ABNF:

    rule /= rulename 1*(":" rulename) defined-as elements c-nl
    element /= rulename 1*(":" group)

In other words, on the left hand side of a rule, a rule can now be specified
as a set of rule names separated by colons, and an element can now be specified
as a rulename followed by colons and groups. (I use groups here to avoid
remembering associativity or precedence rules.)

The leftmost name is the root rule name, and the other names bind local rules.
When the rule is referenced as an element, it must be as the root name followed
(in the above syntax) with one group for each local rule. The local rules get
bound to the groups exactly like normal ABNF rule definitions, except that this
binding only takes effect within the scope of the rule being defined.

In LABNF, the definition for `BENCODE-STR` would be described as:

    BS:num:str = num ":" str /
            BS:(num "0"):(10str 0OCTET) / BS:(num "1"):(10str 1OCTET) /
            BS:(num "2"):(10str 2OCTET) / BS:(num "3"):(10str 3OCTET) /
            BS:(num "4"):(10str 4OCTET) / BS:(num "5"):(10str 5OCTET) /
            BS:(num "6"):(10str 6OCTET) / BS:(num "7"):(10str 7OCTET) /
            BS:(num "8"):(10str 8OCTET) / BS:(num "9"):(10str 9OCTET)

    BENCODE-STR = "0:" /
            BS:("1"):(1OCTET) / BS:("2"):(2OCTET) / BS:("3"):(3OCTET) /
            BS:("4"):(4OCTET) / BS:("5"):(5OCTET) / BS:("6"):(6OCTET) /
            BS:("7"):(7OCTET) / BS:("8"):(8OCTET) / BS:("9"):(9OCTET)

This builds a decimal recursively as `<n> <d>` where `<d>` is a single digit,
in parallel it builds up an octet rule which repeats `10 * n + d` times.

I present LABNF as a curiosity rather than a serious proposal. I don't know of
other situations where LABNF is more userful than ABNF for a practical problem,
and the `<...>` syntax is clearer in this particular case, even though a
computer cannot use it. 