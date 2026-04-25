
Cargo Specifics - Checking Conditional Configurations
This document is intended to summarize the principal ways Cargo interacts with the unexpected_cfgs lint and --check-cfg flag. For individual details, refer to the --check-cfg documentation and to the Cargo book.

The full list of well known cfgs (aka builtins) can be found under Checking conditional configurations / Well known names and values.

Cargo feature
See the [features] section in the Cargo book for more details.

With the [features] table, Cargo provides a mechanism to express conditional compilation and optional dependencies. Cargo automatically declares corresponding cfgs for every feature as expected.

Cargo.toml:

[features]
serde = ["dep:serde"]
my_feature = []
check-cfg in [lints.rust] table
See the [lints] section in the Cargo book for more details.

When using a statically known custom config (i.e., not dependent on a build-script), Cargo provides the custom lint config check-cfg under [lints.rust.unexpected_cfgs].

It can be used to set custom static --check-cfg args, it is mainly useful when the list of expected cfgs is known in advance.

Cargo.toml:

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(has_foo)'] }
cargo::rustc-check-cfg for build.rs/build-script
See the cargo::rustc-check-cfg section in the Cargo book for more details.

When setting a custom config with cargo::rustc-cfg, Cargo provides the corollary instruction: cargo::rustc-check-cfg to expect custom configs.

build.rs:


fn main() {
    println!("cargo::rustc-check-cfg=cfg(has_foo)");
    //        ^^^^^^^^^^^^^^^^^^^^^^ new with Cargo 1.80
    if has_foo() {
        println!("cargo::rustc-cfg=has_foo");
    }
}