# Fix Android Resource Linking Error

The build is failing because `AndroidManifest.xml` incorrectly refers to an XML resource with its file extension (`@xml/apduservice.xml`). In Android, resources should be referenced by their name without the extension (e.g., `@xml/apduservice`).

## Proposed Changes

### [Component: App Manifest]

#### [MODIFY] [AndroidManifest.xml](file:///F:/POS OFFLINE SFTWR/android_pos_app/app/src/main/AndroidManifest.xml)
- Change `android:resource="@xml/apduservice.xml"` to `android:resource="@xml/apduservice"` in the `VirtualCardHceService` declaration.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:processReleaseResources` or a full build `./gradlew assembleDebug` to ensure the resource linking error is resolved.
