/*    <select>
        <option value="volvo">mpg</option>
        <option value="saab">acceleration</option>
        <option value="mercedes">horsepower</option>
        <option value="audi">weight</option>
      </select> */


      export const dropdownMenu = (parent, props) => {
        const { options, onOptionSelected, selectedValue } = props;
      
        const select = parent.selectAll('select').data([null]);
        const selectEnter = select.enter().append('select')
          .merge(select)
          .on('change', function(event) {
            console.log("Dropdown changed to:", event.target.value);  // Verify selected value
            onOptionSelected(event.target.value);
          });
      
        const option = selectEnter.selectAll('option').data(options);
        option.enter().append('option')
          .merge(option)
          .attr('value', d => d)
          .text(d => d)
          .property('selected', d => d === selectedValue);
      };