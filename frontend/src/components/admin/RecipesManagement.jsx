import { useState, useEffect } from 'react';
import api from '../../services/api';

function RecipesManagement() {
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    result_item_id: '',
    result_quantity: 1,
    required_workbench_level: 0,
    ingredients: [{ item_id: '', quantity: 1 }]
  });

  useEffect(() => {
    fetchRecipes();
    fetchItems();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await api.get('/crafting/recipes');
      setRecipes(response.data.recipes);
    } catch (error) {
      console.error('Fehler beim Laden der Rezepte:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items);
    } catch (error) {
      console.error('Fehler beim Laden der Items:', error);
    }
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { item_id: '', quantity: 1 }]
    });
  };

  const removeIngredient = (index) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index)
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index][field] = field === 'quantity' ? parseInt(value) || 1 : value;
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    // Validate
    if (!formData.result_item_id) {
      setMessage('Bitte wähle ein Ergebnis-Item');
      return;
    }

    if (formData.ingredients.length === 0 || formData.ingredients.some(ing => !ing.item_id)) {
      setMessage('Bitte füge mindestens eine Zutat hinzu');
      return;
    }

    try {
      await api.post('/crafting/recipes', formData);
      setMessage('Rezept erfolgreich erstellt!');
      setFormData({
        result_item_id: '',
        result_quantity: 1,
        required_workbench_level: 0,
        ingredients: [{ item_id: '', quantity: 1 }]
      });
      fetchRecipes();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Erstellen des Rezepts');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="admin-section">
      <h2>Neues Crafting-Rezept erstellen</h2>
      
      {message && (
        <div className={message.includes('Fehler') ? 'error' : 'success'}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-form">
        <div className="form-row">
          <div className="form-group">
            <label>Ergebnis-Item</label>
            <select
              value={formData.result_item_id}
              onChange={(e) => setFormData({ ...formData, result_item_id: e.target.value })}
              required
            >
              <option value="">-- Item wählen --</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name} ({item.type})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Ergebnis-Menge</label>
            <input
              type="number"
              min="1"
              value={formData.result_quantity}
              onChange={(e) => setFormData({ ...formData, result_quantity: parseInt(e.target.value) || 1 })}
              required
            />
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label>Benötigtes Werkbank-Level</label>
            <input
              type="number"
              min="0"
              value={formData.required_workbench_level}
              onChange={(e) => setFormData({ ...formData, required_workbench_level: parseInt(e.target.value) || 0 })}
              required
            />
          </div>
        </div>

        <div className="form-row full">
          <div className="form-group">
            <label>
              Zutaten
              <button type="button" onClick={addIngredient} className="btn btn-secondary btn-small" style={{ marginLeft: '1rem' }}>
                + Zutat hinzufügen
              </button>
            </label>
            {formData.ingredients.map((ingredient, index) => (
              <div key={index} style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select
                  value={ingredient.item_id}
                  onChange={(e) => updateIngredient(index, 'item_id', e.target.value)}
                  style={{ flex: 2 }}
                >
                  <option value="">-- Item wählen --</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={ingredient.quantity}
                  onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                  placeholder="Menge"
                  style={{ flex: 1 }}
                />
                {formData.ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="btn btn-danger btn-small"
                  >
                    Entfernen
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary">
          Rezept erstellen
        </button>
      </form>

      <h2>Alle Rezepte ({recipes.length})</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Ergebnis</th>
            <th>Menge</th>
            <th>Werkbank-Level</th>
            <th>Zutaten</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe) => (
            <tr key={recipe.id}>
              <td>{recipe.id}</td>
              <td>{recipe.result_display_name}</td>
              <td>{recipe.result_quantity}x</td>
              <td>{recipe.required_workbench_level}</td>
              <td>
                {recipe.ingredients.map((ing, idx) => (
                  <span key={idx}>
                    {ing.quantity}x {ing.display_name}
                    {idx < recipe.ingredients.length - 1 && ', '}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RecipesManagement;
