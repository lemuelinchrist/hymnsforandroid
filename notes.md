# Troubleshooting
## Running DatabaseProvisioner
### 1
Exception in thread "main" java.lang.UnsupportedClassVersionError: com/lemuelinchrist/hymns/lib/Dao has been compiled by a more recent version of the Java Runtime (class file version 55.0), this version of the Java Runtime only recognizes class file versions up to 52.0  
findings:  
This is due to the Android App requiring JDK v11 to build, but the database provisioner project is not compatible with android 11. the Persistence framework seems to be only compatible with Java 1.8. Try to switch the project to jdk1.8
* go to settings -> gradle -> gradle JVM. make sure the version you are using is the oracle 1.8 one.
* rebuild databaseProvisioner using Gradle
* When you run your Groovy script, make sure the run configuration is set to use oracle java 1.8

If you need to run the Hymn app, do the above steps using android 11 instead of 1.8

