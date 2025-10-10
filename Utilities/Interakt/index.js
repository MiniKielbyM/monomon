HTMLElement.prototype.myFunction = function() {
  console.log("This is a custom function for", this);
};
document.customFunction = function() {
  console.log("This is a custom function for the document");
}
document.customFunction.customsubfunction = function() {
  console.log("This is a custom subfunction for the document");
}